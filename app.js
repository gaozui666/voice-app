const SIGNAL_SERVER = "https://voice-app.keneshao.workers.dev";

let room = "";
let username = "";
let localStream;

const peers = {};

const statusText = document.getElementById("status");
const chatBox = document.getElementById("chatBox");
const userList = document.getElementById("userList");

async function joinRoom() {

  room = document.getElementById("roomId").value;
  username = document.getElementById("username").value;

  if (!room || !username) {
    alert("请输入昵称和房间号");
    return;
  }

  localStream = await navigator.mediaDevices.getUserMedia({
    audio:true
  });

  await fetch(`${SIGNAL_SERVER}/join`,{
    method:"POST",
    headers:{
      "Content-Type":"application/json"
    },
    body:JSON.stringify({
      room,
      username
    })
  });

  statusText.innerText = `已加入 ${room}`;

  addMessage("系统", `${username} 加入了房间`);

  startPolling();
}

async function createPeer(user){

  const pc = new RTCPeerConnection({
    iceServers:[
      {
        urls:"stun:stun.l.google.com:19302"
      }
    ]
  });

  localStream.getTracks().forEach(track=>{
    pc.addTrack(track,localStream);
  });

  pc.ontrack = event=>{
    const audio = new Audio();
    audio.srcObject = event.streams[0];
    audio.play();
  };

  pc.onicecandidate = async event=>{
    if(event.candidate){

      await fetch(`${SIGNAL_SERVER}/candidate`,{
        method:"POST",
        headers:{
          "Content-Type":"application/json"
        },
        body:JSON.stringify({
          room,
          from:username,
          to:user,
          candidate:event.candidate
        })
      });

    }
  };

  peers[user] = pc;

  return pc;
}

async function startPolling(){

  setInterval(async()=>{

    const res = await fetch(
      `${SIGNAL_SERVER}/events?room=${room}&user=${username}`
    );

    const data = await res.json();

    renderUsers(data.users || []);

    for(const event of data.events){

      if(event.type === "message"){
        addMessage(event.from,event.message);
      }

      if(event.type === "offer"){

        const pc = await createPeer(event.from);

        await pc.setRemoteDescription(
          new RTCSessionDescription(event.offer)
        );

        const answer = await pc.createAnswer();

        await pc.setLocalDescription(answer);

        await fetch(`${SIGNAL_SERVER}/answer`,{
          method:"POST",
          headers:{
            "Content-Type":"application/json"
          },
          body:JSON.stringify({
            room,
            from:username,
            to:event.from,
            answer
          })
        });

      }

      if(event.type === "answer"){

        const pc = peers[event.from];

        if(pc){
          await pc.setRemoteDescription(
            new RTCSessionDescription(event.answer)
          );
        }

      }

    }

  },2000);

}

async function connectTo(user){

  const pc = await createPeer(user);

  const offer = await pc.createOffer();

  await pc.setLocalDescription(offer);

  await fetch(`${SIGNAL_SERVER}/offer`,{
    method:"POST",
    headers:{
      "Content-Type":"application/json"
    },
    body:JSON.stringify({
      room,
      from:username,
      to:user,
      offer
    })
  });

}

function renderUsers(users){

  userList.innerHTML = "";

  users.forEach(user=>{

    const li = document.createElement("li");

    li.innerText = user;

    userList.appendChild(li);

    if(user !== username && !peers[user]){
      connectTo(user);
    }

  });

}

async function sendMessage(){

  const input = document.getElementById("messageInput");

  const message = input.value;

  if(!message) return;

  await fetch(`${SIGNAL_SERVER}/message`,{
    method:"POST",
    headers:{
      "Content-Type":"application/json"
    },
    body:JSON.stringify({
      room,
      from:username,
      message
    })
  });

  addMessage(username,message);

  input.value = "";

}

function addMessage(user,message){

  const div = document.createElement("div");

  div.className = "message";

  div.innerHTML = `
    <b>${user}</b><br>
    ${message}
  `;

  chatBox.appendChild(div);

  chatBox.scrollTop = chatBox.scrollHeight;

}
