const todo = document.getElementById('todo');
const addBtn = document.getElementById('add-btn');
const input = document.getElementById('new-task');
const plusRow = document.getElementById('plus-row');

function attachCheckboxHandler(cb) {
  cb.addEventListener('change', () => {
    if (cb.checked) {
      const li = cb.closest('li');
      const car = li.querySelector('.car');
      car.classList.add('zoom');
      for (let i = 0; i < 15; i++) {
        const piece = document.createElement('div');
        piece.className = 'confetti';
        piece.style.left = `${Math.random() * 100}%`;
        piece.style.background = `hsl(${Math.random() * 360}, 80%, 60%)`;
        piece.style.animationDelay = `${Math.random() * 0.5}s`;
        li.appendChild(piece);
      }
      setTimeout(() => {
        car.remove();
        li.querySelectorAll('.confetti').forEach(el => el.remove());
        li.classList.add('done');
        cb.disabled = true; 
        todo.appendChild(li);
      }, 2000);
    }
  });
}
document.querySelectorAll('#todo input[type=checkbox]').forEach(attachCheckboxHandler);
function addNewTask() {
  const text = input.value.trim();
  if (!text) return;
  const li = document.createElement('li');
  li.innerHTML = `<label><input type="checkbox"><span class="text">${text}</span><span class="car">🏎️</span></label>`;
  todo.insertBefore(li, plusRow.nextSibling);
  attachCheckboxHandler(li.querySelector('input[type=checkbox]'));
  input.value = '';
}
addBtn.addEventListener('click', addNewTask);
input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addNewTask(); }});
