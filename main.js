class Constants {
	static CloudOpacity = 0.8;
	static FullOpacityZoom = 1.5;
	static MinOpacityZoom = 3;
	static MaxZoom = 16;
}

const container = document.getElementById('container');
const graphic = document.getElementById('graphic');
const fadeElements = document.querySelectorAll('.fade-element');
let scale = 1;
let evCache = []; // Stores active pointer contacts (fingers/mouse)
let prevDiff = -1; // Stores distance between two fingers
let captureMouse = true;

function updateOpacity(currentScale) {
	let opacity = Constants.CloudOpacity;
	if (currentScale <= Constants.FullOpacityZoom) {
		captureMouse = true;
	}
	if (currentScale <= Constants.FullOpacityZoom) {
		opacity = Constants.CloudOpacity;
	} else if (currentScale >= Constants.MinOpacityZoom) {
		opacity = 0;
	} else {
		opacity = Constants.CloudOpacity - ((currentScale - Constants.FullOpacityZoom) / (Constants.MinOpacityZoom - Constants.FullOpacityZoom));
	}

	// 5. Check zoom level and fade elements out if scale is higher than 2.5
	fadeElements.forEach(element => {
		element.style.opacity = opacity;

		// Performance-Optimierung: Klickbarkeit abschalten, wenn unsichtbar
		if (opacity === 0) {
			element.style.visibility = 'hidden';
		} else {
			element.style.visibility = 'visible';
		}
	});
}

// HILFSFUNKTION: Berechnet den Abstand zwischen zwei Touch-Punkten (Satz des Pythagoras)
function getDistance(touch1, touch2) {
	const dx = touch1.clientX - touch2.clientX;
	const dy = touch1.clientY - touch2.clientY;
	return Math.sqrt(dx * dx + dy * dy);
}

container.addEventListener('wheel', (e) => {
	e.preventDefault(); // Stop page scrolling

	// 1. Get container dimensions and mouse position inside it
	const rect = container.getBoundingClientRect();

	if (captureMouse) {
		const mouseX = e.clientX - rect.left;
		const mouseY = e.clientY - rect.top;

		// 2. Set the transform origin to the current mouse coordinates
		graphic.style.transformOrigin = `${mouseX}px ${mouseY}px`;
		captureMouse = false;
	}

	// 3. Calculate new zoom level
	if (e.deltaY < 0) {
		scale += 0.4; // Zoom In
	} else {
		scale -= 1.5; // Zoom Out
	}

	scale = Math.min(Math.max(1, scale), Constants.MaxZoom);

	graphic.style.transform = `scale(${scale})`;

	updateOpacity(scale);
});

container.onpointerdown = (e) => {
	evCache.push(e); // Cache the new finger touch
};

container.onpointermove = (e) => {

	// Find and update this pointer's coordinates in the cache array
	const index = evCache.findIndex((item) => item.pointerId === e.pointerId);
	if (index !== -1) {
		evCache[index] = e;
	}

	// If exactly TWO pointers are touching the container, handle pinch zoom
	if (evCache.length === 2) {
		const rect = container.getBoundingClientRect();

		//1. Calculate continuous focal center point between both fingers
		const midX = ((evCache[0].clientX + evCache[1].clientX) / 2) - rect.left;
		const midY = ((evCache[0].clientY + evCache[1].clientY) / 2) - rect.top;
		graphic.style.transformOrigin = `${midX}px ${midY}px`;

		// 2. Measure current distance between fingers
		const curDiff = Math.hypot(
			evCache[0].clientX - evCache[1].clientX,
			evCache[0].clientY - evCache[1].clientY,
		);

		if (prevDiff > 0) {
			// Adjust zoom speed multiplier based on movement direction
			const delta = (curDiff - prevDiff) * 0.005;
			scale += delta;
			scale = Math.min(Math.max(1, scale), Constants.MaxZoom);

			graphic.style.transform = `scale(${scale})`;
			updateOpacity(scale);
		}
		prevDiff = curDiff;
	}
};

// Clean up cache when pointers leave or lift up
function removePointer(e) {
	const index = evCache.findIndex((item) => item.pointerId === e.pointerId);
	if (index !== -1) {
		evCache.splice(index, 1);
	}
	if (evCache.length < 2) {
		prevDiff = -1;
	} // Reset pinch memory
}

container.onpointerup = removePointer;
container.onpointercancel = removePointer;
container.onpointerout = removePointer;
container.onpointerleave = removePointer;

// Optional: Reset zoom if mouse leaves the container
container.addEventListener('mouseleave', () => {
	scale = 1;
	graphic.style.transform = `scale(1)`;
	evCache = [];
	prevDiff = -1;
	updateOpacity(1);
});
