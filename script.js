function updateTime() {
 const now = new Date();

 document.getElementById("time").innerText =
   now.toLocaleTimeString();

 let hour = now.getHours();
 let greeting = "";

 if (hour < 12) greeting = "Selamat Pagi";
 else if (hour < 18) greeting = "Selamat Siang";
 else greeting = "Selamat Malam";

 let name = localStorage.getItem("name") || "";

 document.getElementById("greeting").innerText =
   greeting + (name ? ", " + name : "");
}

setInterval(updateTime, 1000);

function saveName() {
 let name = document.getElementById("nameInput").value;
 localStorage.setItem("name", name);
}

let tasks = JSON.parse(localStorage.getItem("tasks")) || [];

function renderTasks() {
 let list = document.getElementById("taskList");
 list.innerHTML = "";

 tasks.forEach((task, index) => {
   let li = document.createElement("li");

   li.innerHTML = `
     ${task}
     <button onclick="deleteTask(${index})">X</button>
   `;

   list.appendChild(li);
 });

 localStorage.setItem("tasks", JSON.stringify(tasks));
}

function addTask() {
 let input = document.getElementById("taskInput");
 let value = input.value.trim();

 if (value === "") return;

 if (tasks.includes(value)) {
   alert("Task sudah ada!");
   return;
 }

 tasks.push(value);
 input.value = "";

 renderTasks();
}

function deleteTask(index) {
 tasks.splice(index, 1);
 renderTasks();
}

renderTasks();

let time = 1500;
let timerInterval;

function updateTimer() {
 let m = Math.floor(time / 60);
 let s = time % 60;

 document.getElementById("timer").innerText =
   `${m}:${s < 10 ? "0" : ""}${s}`;
}

function startTimer() {
 timerInterval = setInterval(() => {
   if (time > 0) {
     time--;
     updateTimer();
   }
 }, 1000);
}

function stopTimer() {
 clearInterval(timerInterval);
}

function resetTimer() {
 time = 1500;
 updateTimer();
}

updateTimer();

function toggleDarkMode() {
 document.body.classList.toggle("dark");
}