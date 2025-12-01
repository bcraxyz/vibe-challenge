import { initializeApp } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-auth.js";

let currentUser = null;
let allLinks = [];

const firebaseConfig = {
    apiKey: "AIzaSyCiUbYrkY2ocp_YvxWieYLmGCFdlrrTwoc",
    authDomain: "mba-vibesuite.firebaseapp.com",
    projectId: "mba-vibesuite",
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const authScreen = document.getElementById('authScreen');
const appScreen = document.getElementById('appScreen');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const signInBtn = document.getElementById('signInBtn');
const signUpBtn = document.getElementById('signUpBtn');
const signOutBtn = document.getElementById('signOutBtn');
const authError = document.getElementById('authError');
const userEmail = document.getElementById('userEmail');
const userMenuBtn = document.getElementById('userMenuBtn');
const userMenu = document.getElementById('userMenu');
const urlInput = document.getElementById('urlInput');
const addLinkBtn = document.getElementById('addLinkBtn');
const addBtnText = document.getElementById('addBtnText');
const addBtnLoader = document.getElementById('addBtnLoader');
const addLinkError = document.getElementById('addLinkError');
const searchInput = document.getElementById('searchInput');
const linksContainer = document.getElementById('linksContainer');

// Tab switching
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const tabName = btn.dataset.tab;
        
        // Update active tab button
        tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        // Update active tab content
        tabContents.forEach(content => content.classList.remove('active'));
        document.getElementById(`${tabName}Tab`).classList.add('active');
    });
});

userMenuBtn.addEventListener('click', e => { 
    e.stopPropagation(); 
    userMenu.classList.toggle('hidden'); 
});

document.addEventListener('click', e => { 
    if (!userMenu.classList.contains('hidden') && !userMenu.contains(e.target)) 
        userMenu.classList.add('hidden'); 
});

onAuthStateChanged(auth, async user => {
    if (user) {
        currentUser = user;
        showApp();
        await loadLinks();
    } else {
        currentUser = null;
        showAuth();
    }
});

function showAuth() { 
    authScreen.classList.remove('hidden'); 
    appScreen.classList.add('hidden'); 
}

function showApp() { 
    authScreen.classList.add('hidden'); 
    appScreen.classList.remove('hidden'); 
    userEmail.textContent = currentUser.email; 
}

signUpBtn.addEventListener('click', async () => {
    const email = emailInput.value.trim(), password = passwordInput.value;
    if (!email || !password) { 
        authError.textContent='Please enter email and password'; 
        return; 
    }
    if (password.length<6) { 
        authError.textContent='Password must be at least 6 characters'; 
        return; 
    }
    try {
        authError.textContent='';
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        currentUser = userCredential.user;
        emailInput.value=''; 
        passwordInput.value='';
        showApp(); 
        await loadLinks();
    } catch(e) { 
        authError.textContent = e.message; 
    }
});

signInBtn.addEventListener('click', async () => {
    const email = emailInput.value.trim(), password = passwordInput.value;
    if (!email || !password) { 
        authError.textContent='Please enter email and password'; 
        return; 
    }
    try {
        authError.textContent='';
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        currentUser = userCredential.user;
        emailInput.value=''; 
        passwordInput.value='';
        showApp(); 
        await loadLinks();
    } catch(e) { 
        authError.textContent = e.message; 
    }
});

signOutBtn.addEventListener('click', async () => {
    userMenu.classList.add('hidden');
    try { 
        await signOut(auth); 
        allLinks=[]; 
        showAuth(); 
    } 
    catch(e){ 
        console.error('Sign out failed',e); 
    }
});

// Linkwise functionality
addLinkBtn.addEventListener('click', async () => {
    const url = urlInput.value.trim();
    if (!url) { 
        addLinkError.textContent='Please enter a URL'; 
        return; 
    }
    if (!isValidUrl(url)) { 
        addLinkError.textContent='Please enter a valid URL'; 
        return; 
    }
    try {
        addLinkError.textContent=''; 
        addBtnText.textContent='Saving...'; 
        addBtnLoader.classList.remove('hidden'); 
        addLinkBtn.disabled=true;
        
        const token = await currentUser.getIdToken();
        const res = await fetch('/api/links', {
            method: 'POST',
            headers: { 
                'Content-Type':'application/json', 
                'Authorization': 'Bearer '+token 
            },
            body: JSON.stringify({ url })
        });
        const data = await res.json();
        
        if(res.ok && data.success){ 
            urlInput.value=''; 
            await loadLinks(); 
        }
        else addLinkError.textContent=data.error||'Failed to add link';
    } catch { 
        addLinkError.textContent='Failed to add link. Please try again.'; 
    }
    finally { 
        addBtnText.textContent='Save'; 
        addBtnLoader.classList.add('hidden'); 
        addLinkBtn.disabled=false; 
    }
});

async function loadLinks(){
    if (!currentUser) return;
    try {
        const token = await currentUser.getIdToken();
        const res = await fetch('/api/links', { 
            headers: { 'Authorization':'Bearer '+token } 
        });
        const data = await res.json();
        
        if(data.success){ 
            allLinks=data.links; 
            renderLinks(allLinks); 
        }
    } catch(e){ 
        console.error('Failed to load links:', e); 
    }
}

function renderLinks(links){
    if(!links.length){
        linksContainer.innerHTML='<div class="empty-state"><p>No links found.</p></div>';
        return;
    }
    linksContainer.innerHTML = links.map(link => `
        <div class="link-card" data-link-id="${link.id}">
            <div class="link-header">
                <div style="flex: 1;">
                    <div class="link-title">
                        <a href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer" class="link-icon" title="${escapeHtml(link.url)}">🔗</a>
                        <span>${escapeHtml(link.title)}</span>
                    </div>
                </div>
                <div style="display: flex; flex-direction: column; align-items: flex-end;">
                    <button class="delete-btn" onclick="deleteLink('${link.id}')" title="Delete link">×</button>
                </div>
            </div>
            <div class="link-summary">${escapeHtml(link.summary)}</div>
            <div class="link-tags">
                ${link.tags.slice(0,6).map(tag => `<span class="tag">#${escapeHtml(tag)}</span>`).join('')}
                <span class="link-date">${formatDate(link.createdAt)}</span>
            </div>
        </div>
    `).join('');
}

window.deleteLink=async (id)=>{
    if(!confirm('Delete this link?')) return;
    try{
        const token = await currentUser.getIdToken();
        const res = await fetch(`/api/links/${id}`, { 
            method:'DELETE', 
            headers:{'Authorization':'Bearer '+token} 
        });
        const data = await res.json();
        
        if(data.success) await loadLinks();
    } catch(e){ 
        console.error('Failed to delete link',e); 
    }
};

searchInput.addEventListener('input', e=>{
    const q=e.target.value.toLowerCase().trim();
    if(!q){ 
        renderLinks(allLinks); 
        return; 
    }
    renderLinks(allLinks.filter(l=>
        l.title.toLowerCase().includes(q)||
        l.url.toLowerCase().includes(q)||
        l.summary.toLowerCase().includes(q)||
        l.tags.some(t=>t.toLowerCase().includes(q))
    ));
});

emailInput.addEventListener('keypress',e=>{ 
    if(e.key==='Enter') passwordInput.focus(); 
});

passwordInput.addEventListener('keypress',e=>{ 
    if(e.key==='Enter') signInBtn.click(); 
});

urlInput.addEventListener('keypress',e=>{ 
    if(e.key==='Enter') addLinkBtn.click(); 
});

function isValidUrl(string){ 
    try{ 
        new URL(string); 
        return true; 
    } catch{
        return false; 
    } 
}

function escapeHtml(text){ 
    if(text==null) return''; 
    const div=document.createElement('div'); 
    div.textContent=text; 
    return div.innerHTML; 
}

function formatDate(dateString) {
    if (!dateString) return 'Just now';
    
    const d = new Date(dateString);
    const now = new Date();
    
    // Calculate difference in milliseconds
    // Math.max(0, ...) ensures we never get negative numbers even if server time is ahead
    const diff = Math.max(0, now - d);
    
    // Convert to days
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
        return 'Today';
    } else if (days === 1) {
        return 'Yesterday';
    } else if (days < 7) {
        return `${days} days ago`;
    } else {
        return d.toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric' 
        });
    }
}
