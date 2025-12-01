import { initializeApp } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-auth.js";
const firebaseConfig = { apiKey: "AIzaSyDrVLfTKNY-5wTybEML7FsgXm5OPbabx2g", authDomain: "mba-linkwise.firebaseapp.com", projectId: "mba-linkwise" };
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
let currentUser = null;
const authScreen = document.getElementById('authScreen');
const appScreen = document.getElementById('appScreen');
onAuthStateChanged(auth, async user => {
    if (user) { currentUser = user; showApp(); await loadLinks(); } else { currentUser = null; showAuth(); }
});
function showAuth() { authScreen.classList.remove('hidden'); appScreen.classList.add('hidden'); }
function showApp() { authScreen.classList.add('hidden'); appScreen.classList.remove('hidden'); }
document.getElementById('signInBtn').addEventListener('click', async () => {
    const email = document.getElementById('email').value, password = document.getElementById('password').value;
    try { await signInWithEmailAndPassword(auth, email, password); } catch(e) { alert(e.message); }
});
document.getElementById('signUpBtn').addEventListener('click', async () => {
    const email = document.getElementById('email').value, password = document.getElementById('password').value;
    try { await createUserWithEmailAndPassword(auth, email, password); } catch(e) { alert(e.message); }
});
document.getElementById('signOutBtn').addEventListener('click', () => signOut(auth));
document.getElementById('addLinkBtn').addEventListener('click', async () => {
    const url = document.getElementById('urlInput').value;
    if(!url) return;
    try {
        const token = await currentUser.getIdToken();
        const res = await fetch('/api/links', { method: 'POST', headers: {'Content-Type':'application/json', 'Authorization': 'Bearer '+token}, body: JSON.stringify({url}) });
        const data = await res.json();
        if(data.success) { document.getElementById('urlInput').value=''; loadLinks(); }
    } catch(e) { console.error(e); }
});
async function loadLinks(){
    if(!currentUser) return;
    const token = await currentUser.getIdToken();
    const res = await fetch('/api/links', { headers: {'Authorization':'Bearer '+token} });
    const data = await res.json();
    if(data.success) renderLinks(data.links);
}
function renderLinks(links){
    document.getElementById('linksContainer').innerHTML = links.map(link => `
        <div class="link-card">
            <h3><a href="${link.url}" target="_blank">${link.title}</a></h3>
            <p>${link.summary}</p>
            <div style="margin-top:10px">${link.tags.map(t=>`<span class="tag">#${t}</span>`).join('')}</div>
            <button onclick="deleteLink('${link.id}')" style="margin-top:10px;color:red;border:none;background:none;cursor:pointer">Delete</button>
        </div>
    `).join('');
}
window.deleteLink = async (id) => {
    if(!confirm('Delete?')) return;
    const token = await currentUser.getIdToken();
    await fetch(`/api/links/${id}`, { method:'DELETE', headers:{'Authorization':'Bearer '+token} });
    loadLinks();
}
