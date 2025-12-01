import { initializeApp } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.1.0/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyCjd16pOZ9O5-Ktom8lnDctp_0Qniaq61o",
    authDomain: "mba-linkwise.firebaseapp.com",
    projectId: "mba-linkwise",
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const emailInput = document.getElementById('email');
const passInput = document.getElementById('password');
const errorMsg = document.getElementById('errorMsg');

onAuthStateChanged(auth, (user) => {
    const isLanding = document.querySelector('.landing-body');
    const isDashboard = document.querySelector('.app-layout');
    if (user) {
        if (isLanding) window.location.href = '/dashboard';
        else if (isDashboard) document.getElementById('userEmail').textContent = user.email;
    } else {
        if (isDashboard) window.location.href = '/';
    }
});

if (loginBtn) {
    loginBtn.addEventListener('click', async () => {
        try {
            errorMsg.classList.add('hidden');
            await signInWithEmailAndPassword(auth, emailInput.value, passInput.value);
        } catch (error) {
            errorMsg.textContent = "Invalid email or password.";
            errorMsg.classList.remove('hidden');
        }
    });
}
if (logoutBtn) logoutBtn.addEventListener('click', () => signOut(auth));

const navItems = document.querySelectorAll('.nav-item');
if (navItems.length > 0) {
    navItems.forEach(btn => {
        btn.addEventListener('click', () => {
            navItems.forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.app-view').forEach(v => v.classList.add('hidden'));
            btn.classList.add('active');
            const target = btn.dataset.target;
            const view = document.getElementById(`${target}-view`);
            view.classList.remove('hidden');
            
            // Inject CSS into Linkwise Iframe to hide its internal auth screen
            if (target === 'linkwise') {
                const frame = view.querySelector('iframe');
                if (frame && frame.contentDocument) {
                    const style = document.createElement('style');
                    style.textContent = "#authScreen { display: none !important; } #appScreen { display: block !important; } header { border-radius: 0; margin: 0 0 20px 0; }";
                    frame.contentDocument.head.appendChild(style);
                }
            }
        });
    });
}
