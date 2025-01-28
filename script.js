document.addEventListener('DOMContentLoaded', function() {
    const moduleOptions = document.querySelectorAll('.module-option');
    const modules = [null, null];
    const moduleElements = [
        { container: document.getElementById('module1'), imageElement: null },
        { container: document.getElementById('module2'), imageElement: null }
    ];
    const playButton = document.getElementById('playButton');

    let currentDraggedModule = null;

    moduleOptions.forEach(option => {
        option.addEventListener('dragstart', function(event) {
            currentDraggedModule = {
                type: this.getAttribute('data-type'),
                imageSrc: this.getAttribute('data-image')
            };
            event.dataTransfer.setData('text/plain', JSON.stringify(currentDraggedModule));
        });
    });

    document.querySelectorAll('.module').forEach(module => {
        module.addEventListener('dragover', function(event) {
            event.preventDefault();
        });

        module.addEventListener('drop', function(event) {
            event.preventDefault();

            if (!this.querySelector('img')) {
                const droppedModule = JSON.parse(event.dataTransfer.getData('text/plain'));

                // Set module image
                const img = document.createElement('img');
                img.src = droppedModule.imageSrc;
                img.alt = droppedModule.type;
                img.style.width = '100%';
                img.style.height = 'auto';

                this.appendChild(img);

                // Save module data
                for (let i = 0; i < modules.length; i++) {
                    if (moduleElements[i].container === this) {
                        modules[i] = droppedModule.type;
                        break;
                    }
                }

                // Check if all modules are selected
                if (modules.every(module => module)) {
                    playButton.style.display = 'block';
                }
            }
        });
    });

    playButton.addEventListener('click', function() {
        alert('Starting the game!');
        // Here you can add the logic to start the game
    });
});