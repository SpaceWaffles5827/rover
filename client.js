const io = require("socket.io-client");
const SimplePeer = require("simple-peer");
const readline = require("readline");
const wrtc = require("wrtc");
const ffmpeg = require("fluent-ffmpeg");
const fs = require("fs");

const socket = io("http://localhost:8000");
let peer = null;
let otherUserID = null;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function prompt(question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

// Function to simulate a video stream by streaming chunks of the video file
function createFakeMediaStream() {
  const videoPath = "C:/Users/jackh/Downloads/file_example_MP4_640_3MG.mp4";

  // Check if the video file exists
  if (!fs.existsSync(videoPath)) {
    console.error("Video file not found at path:", videoPath);
    return null;
  }

  try {
    // Set up FFmpeg to output raw video frames
    const videoStream = ffmpeg(videoPath)
      .inputOptions("-re") // Process in real-time
      .noAudio()
      .videoCodec("libvpx")
      .format("webm");

    console.log("Video stream setup with FFmpeg.");
    return videoStream;
  } catch (error) {
    console.error("Failed to create media stream from video file:", error);
    return null;
  }
}

async function main() {
  const roomID = await prompt("Enter Room ID: ");
  const choice = await prompt("Enter 'c' to create a room or 'j' to join: ");

  if (choice.toLowerCase() === "c") {
    socket.emit("create room", roomID);
    console.log("Room created, waiting for another user to join...");
  } else if (choice.toLowerCase() === "j") {
    socket.emit("join room", roomID);
    console.log("Joining room...");
  } else {
    console.log("Invalid choice.");
    process.exit();
  }

  // Set up socket listeners
  socket.on("other user", (userID) => {
    console.log("User connected:", userID);
    otherUserID = userID;
    callUser(userID);
  });

  socket.on("user joined", (userID) => {
    console.log("User joined room:", userID);
    otherUserID = userID;
  });

  socket.on("offer", handleReceiveCall);
  socket.on("answer", handleAnswer);
  socket.on("ice-candidate", handleNewICECandidateMsg);
  socket.on("room exists", () => console.log("Room already exists!"));
  socket.on("no such room", () => console.log("Room does not exist!"));
  socket.on("user left", handleUserLeft);
}

// Functions for handling WebRTC signaling
function createPeer(isInitiator, userID) {
  peer = new SimplePeer({
    initiator: isInitiator,
    wrtc,
    config: {
      iceServers: [
        { urls: "stun:stun.stunprotocol.org" },
        {
          urls: "turn:numb.viagenie.ca",
          credential: "muazkh",
          username: "webrtc@live.com",
        },
      ],
    },
  });

  peer.on("signal", (data) => {
    if (data.type === "offer") {
      socket.emit("offer", { target: userID, sdp: data });
    } else if (data.type === "answer") {
      socket.emit("answer", { target: userID, sdp: data });
    } else if (data.candidate) {
      socket.emit("ice-candidate", {
        target: otherUserID,
        candidate: data.candidate,
      });
    }
  });

  peer.on("connect", () => {
    console.log("Connected to peer!");

    // Start streaming video chunks on connection
    const fakeStream = createFakeMediaStream();
    if (!fakeStream) {
      console.error("Failed to create video stream.");
      return;
    }

    fakeStream.on("data", (chunk) => {
      peer.send(chunk); // Send each chunk to the peer
    });

    fakeStream.on("end", () => {
      console.log("End of video stream.");
    });
  });

  peer.on("data", (data) => {
    console.log("Received message:", data.toString());
  });

  peer.on("close", handleUserLeft);

  return peer;
}

function callUser(userID) {
  peer = createPeer(true, userID);
}

function handleReceiveCall({ sdp, caller }) {
  console.log("Receiving call from:", caller);
  otherUserID = caller;
  peer = createPeer(false, caller);
  peer.signal(sdp);
}

function handleAnswer({ sdp }) {
  console.log("Call answered.");
  peer.signal(sdp);
}

function handleNewICECandidateMsg(incoming) {
  try {
    const candidate = new wrtc.RTCIceCandidate(incoming);
    if (peer) {
      peer.signal({ candidate });
    } else {
      console.error(
        "Peer connection does not exist when ICE candidate received"
      );
    }
  } catch (error) {
    console.error("Error creating ICE candidate:", error);
  }
}

function handleUserLeft() {
  console.log("User left the room.");
  if (peer) peer.destroy();
  peer = null;
  otherUserID = null;
}

// Start main
main();
