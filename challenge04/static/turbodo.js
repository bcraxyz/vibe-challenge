// Turbo-Do functionality
// This script initializes after the DOM is loaded

function initTurboDo() {
    const todo = document.getElementById('todo');
    const addBtn = document.getElementById('add-btn');
    const input = document.getElementById('new-task');
    const plusRow = document.getElementById('plus-row');

    if (!todo || !addBtn || !input || !plusRow) {
        // Elements not ready yet, will be initialized when tab is switched
        return;
    }

    // Handle checkbox completion
    function attachCheckboxHandler(cb) {
        cb.addEventListener('change', () => {
            if (cb.checked) {
                const li = cb.closest('li');
                const car = li.querySelector('.car');

                car.classList.add('zoom');

                // Confetti
                for (let i = 0; i < 15; i++) {
                    const piece = document.createElement('div');
                    piece.className = 'confetti';
                    piece.style.left = `${Math.random() * 100}%`;
                    piece.style.background = `hsl(${Math.random() * 360}, 80%, 60%)`;
                    piece.style.animationDelay = `${Math.random() * 0.5}s`;
                    li.appendChild(piece);
                }

                setTimeout(() => {
                    car.remove(); // remove car icon
                    li.querySelectorAll('.confetti').forEach(el => el.remove());
                    li.classList.add('done');
                    cb.disabled = true;
                    todo.appendChild(li); // move to bottom
                }, 2000);
            }
        });
    }

    // Hook up existing checkboxes
    document.querySelectorAll('#todo input[type=checkbox]').forEach(attachCheckboxHandler);

    // Add a new task
    function addNewTask() {
        const text = input.value.trim();
        if (!text) return;

        const li = document.createElement('li');
        li.innerHTML = `
            <label>
                <input type="checkbox">
                <span class="text">${escapeHtml(text)}</span>
                <span class="car">🏎️</span>
            </label>
        `;
        todo.insertBefore(li, plusRow.nextSibling); // add at top (below plus-row)
        attachCheckboxHandler(li.querySelector('input[type=checkbox]'));
        input.value = '';
    }

    // Bind add task to button click and Enter key
    addBtn.addEventListener('click', addNewTask);
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addNewTask();
        }
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTurboDo);
} else {
    initTurboDo();
}
