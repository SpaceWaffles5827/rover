"use client";
import React, { useRef, useEffect } from "react";
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
  const userVideo = useRef<HTMLVideoElement | null>(null);
  const partnerVideo = useRef<HTMLVideoElement | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const otherUser = useRef<string | null>(null);
  const userStream = useRef<MediaStream | null>(null);
  const senders = useRef<RTCRtpSender[]>([]);

  useEffect(() => {
    navigator.mediaDevices
      .getUserMedia({ audio: true, video: true })
      .then((stream) => {
        if (userVideo.current) {
          userVideo.current.srcObject = stream;
        }
        userStream.current = stream;

        // Directly use `io` without `.connect`
        socketRef.current = io("http://localhost:8000");
        socketRef.current.emit("join room", "123");

        socketRef.current.on("other user", (userID: string) => {
          callUser(userID);
          otherUser.current = userID;
        });

        socketRef.current.on("user joined", (userID: string) => {
          otherUser.current = userID;
        });

        socketRef.current.on("offer", handleRecieveCall);

        socketRef.current.on("answer", handleAnswer);

        socketRef.current.on("ice-candidate", handleNewICECandidateMsg);
      })
      .catch((error) => console.log("Error accessing media devices:", error));
  }, []);

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
        {
          urls: "stun:stun.stunprotocol.org",
        },
        {
          urls: "turn:numb.viagenie.ca",
          credential: "muazkh",
          username: "webrtc@live.com",
        },
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
        const payload = {
          target: userID,
          caller: socketRef.current?.id,
          sdp: peerRef.current?.localDescription,
        };
        socketRef.current?.emit("offer", payload);
      })
      .catch((e) => console.log(e));
  }

  function handleRecieveCall(incoming: IncomingCallPayload) {
    peerRef.current = createPeer(incoming.caller);
    const desc = new RTCSessionDescription(incoming.sdp);
    peerRef.current
      ?.setRemoteDescription(desc)
      .then(() => {
        userStream.current?.getTracks().forEach((track) =>
          peerRef.current?.addTrack(track, userStream.current!)
        );
      })
      .then(() => peerRef.current?.createAnswer())
      .then((answer) => peerRef.current?.setLocalDescription(answer))
      .then(() => {
        const payload = {
          target: incoming.caller,
          caller: socketRef.current?.id,
          sdp: peerRef.current?.localDescription,
        };
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
      const payload: ICECandidatePayload = {
        target: otherUser.current!,
        candidate: e.candidate,
      };
      socketRef.current?.emit("ice-candidate", payload);
    }
  }

  function handleNewICECandidateMsg(incoming: RTCIceCandidateInit) {
    const candidate = new RTCIceCandidate(incoming);
    peerRef.current?.addIceCandidate(candidate).catch((e) => console.log(e));
  }

  function handleTrackEvent(e: RTCTrackEvent) {
    if (partnerVideo.current) {
      partnerVideo.current.srcObject = e.streams[0];
    }
  }

  return (
    <div>
      <video
        controls
        style={{ height: 500, width: 500 }}
        autoPlay
        muted
        ref={userVideo}
      />
      <video
        controls
        style={{ height: 500, width: 500 }}
        autoPlay
        muted
        ref={partnerVideo}
      />
    </div>
  );
};

export default Room;
