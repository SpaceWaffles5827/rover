"use client";
import React, { useState, useRef, useEffect } from "react";
import io, { Socket } from "socket.io-client";

type IncomingCallPayload = {
  sdp: RTCSessionDescriptionInit;
  caller: string;
};

type ICECandidatePayload = {
  candidate: RTCIceCandidateInit;
  target: string;
};

type AnswerPayload = {
  sdp: RTCSessionDescriptionInit;
};

const Room: React.FC = () => {
  const [roomID, setRoomID] = useState("");
  const [inRoom, setInRoom] = useState(false);
  const userVideo = useRef<HTMLVideoElement | null>(null);
  const partnerVideo = useRef<HTMLVideoElement | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const otherUser = useRef<string | null>(null);
  const userStream = useRef<MediaStream | null>(null);
  const senders = useRef<RTCRtpSender[]>([]);

  useEffect(() => {
    socketRef.current = io("http://localhost:8000");

    socketRef.current.on("other user", (userID: string) => {
      callUser(userID);
      otherUser.current = userID;
    });

    socketRef.current.on("user joined", (userID: string) => {
      otherUser.current = userID;
    });

    socketRef.current.on("offer", handleReceiveCall);
    socketRef.current.on("answer", handleAnswer);
    socketRef.current.on("ice-candidate", handleNewICECandidateMsg);
    socketRef.current.on("room exists", () => alert("Room already exists!"));
    socketRef.current.on("no such room", () => alert("Room does not exist!"));
    socketRef.current.on("user left", () => handleUserLeft());

    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  const startMedia = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    if (userVideo.current) {
      userVideo.current.srcObject = stream;
    }
    userStream.current = stream;
  };

  const createRoom = () => {
    if (!roomID) return alert("Please enter a room ID");
    startMedia().then(() => {
      socketRef.current?.emit("create room", roomID);
      setInRoom(true);
    });
  };

  const joinRoom = () => {
    if (!roomID) return alert("Please enter a room ID");
    startMedia().then(() => {
      socketRef.current?.emit("join room", roomID);
      setInRoom(true);
    });
  };

  const leaveRoom = () => {
    socketRef.current?.emit("leave room", roomID);
    handleUserLeft();
  };

  function callUser(userID: string) {
    peerRef.current = createPeer(userID);
    userStream.current?.getTracks().forEach((track) => {
      const sender = peerRef.current?.addTrack(track, userStream.current!);
      if (sender) senders.current.push(sender);
    });
  }

  function createPeer(userID: string): RTCPeerConnection {
    const peer = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.stunprotocol.org" },
        { urls: "turn:numb.viagenie.ca", credential: "muazkh", username: "webrtc@live.com" },
      ],
    });
    peer.onicecandidate = handleICECandidateEvent;
    peer.ontrack = handleTrackEvent;
    peer.onnegotiationneeded = () => handleNegotiationNeededEvent(userID);
    return peer;
  }

  function handleNegotiationNeededEvent(userID: string) {
    peerRef.current
      ?.createOffer()
      .then((offer) => peerRef.current?.setLocalDescription(offer))
      .then(() => {
        const payload = { target: userID, caller: socketRef.current?.id, sdp: peerRef.current?.localDescription };
        socketRef.current?.emit("offer", payload);
      })
      .catch((e) => console.log(e));
  }

  function handleReceiveCall(incoming: IncomingCallPayload) {
    peerRef.current = createPeer(incoming.caller);
    const desc = new RTCSessionDescription(incoming.sdp);
    peerRef.current
      ?.setRemoteDescription(desc)
      .then(() => {
        userStream.current?.getTracks().forEach((track) => peerRef.current?.addTrack(track, userStream.current!));
      })
      .then(() => peerRef.current?.createAnswer())
      .then((answer) => peerRef.current?.setLocalDescription(answer))
      .then(() => {
        const payload = { target: incoming.caller, caller: socketRef.current?.id, sdp: peerRef.current?.localDescription };
        socketRef.current?.emit("answer", payload);
      })
      .catch((e) => console.log(e));
  }

  function handleAnswer(message: AnswerPayload) {
    const desc = new RTCSessionDescription(message.sdp);
    peerRef.current?.setRemoteDescription(desc).catch((e) => console.log(e));
  }

  function handleICECandidateEvent(e: RTCPeerConnectionIceEvent) {
    if (e.candidate) {
      const payload: ICECandidatePayload = { target: otherUser.current!, candidate: e.candidate };
      socketRef.current?.emit("ice-candidate", payload);
    }
  }

  function handleNewICECandidateMsg(incoming: RTCIceCandidateInit) {
    console.log("ice candidate received", incoming);
    const candidate = new RTCIceCandidate(incoming);
    console.log("iceice", candidate)
    peerRef.current?.addIceCandidate(candidate).catch((e) => console.log(e));
  }

  function handleTrackEvent(e: RTCTrackEvent) {
    if (partnerVideo.current) {
      partnerVideo.current.srcObject = e.streams[0];
    }
  }

  function handleUserLeft() {
    if (peerRef.current) peerRef.current.close();
    peerRef.current = null;
    otherUser.current = null;
    setInRoom(false);
    if (partnerVideo.current) partnerVideo.current.srcObject = null;
  }

  return (
    <div>
      {!inRoom && (
        <div>
          <input
            type="text"
            placeholder="Enter Room ID"
            value={roomID}
            onChange={(e) => setRoomID(e.target.value)}
          />
          <button onClick={createRoom}>Create Room</button>
          <button onClick={joinRoom}>Join Room</button>
        </div>
      )}
      {inRoom && <button onClick={leaveRoom}>Leave Room</button>}
      <video ref={userVideo} controls style={{ height: 300, width: 400 }} autoPlay muted />
      <video ref={partnerVideo} controls style={{ height: 300, width: 400 }} autoPlay muted />
    </div>
  );
};

export default Room;
