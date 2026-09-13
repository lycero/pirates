class Constants {
	static CloudOpacity = 0.95;
	static FullOpacityZoom = 1.5;
	static MinOpacityZoom = 3;
	static MaxZoom = 16;
}

const MAP_WIDTH = 1615;
const MAP_HEIGHT = 1000;

const viewport = document.getElementById('viewport');
const mapContent = document.getElementById('map-content');
const coordsEl = document.getElementById('coords');
const fadeElements = document.querySelectorAll('.fade-element');

let scale = 1;
let translateX = 0;
let translateY = 0;

const pointers = new Map(); // pointerId -> {x, y} in screen coordinates
let pinchDist = -1; // Last distance between two fingers
let panStart = null; // {x, y} where the first pointer went down
let panOrigin = null; // {x, y} translate value when panning started
let dragged = false; // True if a drag moved beyond the click threshold

function updateTransform() {
	mapContent.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
	updateCenterCoords();
}

function updateOpacity(currentScale) {
	let opacity;
	if (currentScale <= Constants.FullOpacityZoom) {
		opacity = Constants.CloudOpacity;
	} else if (currentScale >= Constants.MinOpacityZoom) {
		opacity = 0;
	} else {
		opacity = Constants.CloudOpacity - ((currentScale - Constants.FullOpacityZoom) / (Constants.MinOpacityZoom - Constants.FullOpacityZoom));
	}

	fadeElements.forEach(element => {
		element.style.opacity = opacity;
		element.style.visibility = opacity === 0 ? 'hidden' : 'visible';
	});
}

// Keeps the viewport-space point (px, py) fixed while changing the zoom level
function zoomAtPoint(newScale, px, py) {
	const ratio = newScale / scale;
	translateX = px - (px - translateX) * ratio;
	translateY = py - (py - translateY) * ratio;
	scale = newScale;
	updateTransform();
	updateOpacity(scale);
}

/* ------------------------------------------------------------------ */
/* Coordinate readout                                                  */
/* ------------------------------------------------------------------ */

// Converts a screen point inside the viewport into map pixel coordinates
function viewportToMap(clientX, clientY, rect) {
	const localX = (clientX - rect.left - translateX) / scale;
	const localY = (clientY - rect.top - translateY) / scale;
	return {
		x: (localX / rect.width) * MAP_WIDTH,
		y: (localY / rect.height) * MAP_HEIGHT,
	};
}

// Maps map pixels onto a pseudo lat/long grid (equirectangular style)
function toLatLon(mapX, mapY) {
	return {
		lat: ((MAP_HEIGHT / 2 - mapY) / (MAP_HEIGHT / 2)) * 90,
		lon: ((mapX - MAP_WIDTH / 2) / (MAP_WIDTH / 2)) * 180,
	};
}

function toDegMin(value) {
	const abs = Math.abs(value);
	const deg = Math.floor(abs);
	let min = Math.round((abs - deg) * 60);
	if (min === 60) {
		min = 0;
		return `${deg + 1}\u00B0 00\u2032`;
	}
	return `${deg}\u00B0 ${String(min).padStart(2, '0')}\u2032`;
}

function setCoords(clientX, clientY) {
	const rect = viewport.getBoundingClientRect();
	const { x, y } = viewportToMap(clientX, clientY, rect);
	const { lat, lon } = toLatLon(x, y);
	const ns = lat < 0 ? 'S' : 'N';
	const ew = lon < 0 ? 'W' : 'E';
	coordsEl.textContent = `${toDegMin(lat)} ${ns}   \u00B7   ${toDegMin(lon)} ${ew}`;
}

function updateCenterCoords() {
	const rect = viewport.getBoundingClientRect();
	setCoords(rect.left + rect.width / 2, rect.top + rect.height / 2);
}

/* ------------------------------------------------------------------ */
/* Interactions                                                        */
/* ------------------------------------------------------------------ */

// Prevent the browser from starting a native drag on the images
viewport.addEventListener('dragstart', (e) => e.preventDefault());

viewport.addEventListener('wheel', (e) => {
	e.preventDefault();

	const rect = viewport.getBoundingClientRect();
	const factor = Math.pow(1.1, -e.deltaY / 100);
	const newScale = Math.min(Math.max(1, scale * factor), Constants.MaxZoom);

	zoomAtPoint(newScale, e.clientX - rect.left, e.clientY - rect.top);
}, { passive: false });

viewport.addEventListener('pointerdown', (e) => {
	if (e.pointerType === 'mouse' && e.button !== 0) return;

	pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

	if (pointers.size === 1) {
		panStart = { x: e.clientX, y: e.clientY };
		panOrigin = { x: translateX, y: translateY };
		dragged = false;
	}

	if (pointers.size === 2) {
		const values = [...pointers.values()];
		pinchDist = Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y);
	}

	try {
		viewport.setPointerCapture(e.pointerId);
	} catch (err) {
		// Pointer may already be gone; ignore
	}
});

viewport.addEventListener('pointermove', (e) => {
	if (!pointers.has(e.pointerId)) return;

	pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

	if (pointers.size === 2) {
		// Pinch zoom, anchored at the midpoint between the two fingers
		const values = [...pointers.values()];
		const midX = (values[0].x + values[1].x) / 2;
		const midY = (values[0].y + values[1].y) / 2;
		const dist = Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y);

		if (pinchDist > 0 && dist > 0) {
			const newScale = Math.min(Math.max(1, scale * (dist / pinchDist)), Constants.MaxZoom);
			const rect = viewport.getBoundingClientRect();
			zoomAtPoint(newScale, midX - rect.left, midY - rect.top);
		}
		pinchDist = dist;
	} else if (pointers.size === 1 && panStart) {
		// Pan: 1:1 screen-space movement
		const dx = e.clientX - panStart.x;
		const dy = e.clientY - panStart.y;
		if (Math.abs(dx) + Math.abs(dy) > 8) {
			dragged = true;
		}
		translateX = panOrigin.x + dx;
		translateY = panOrigin.y + dy;
		updateTransform();
	}
});

function endPointer(e) {
	if (!pointers.has(e.pointerId)) return;
	pointers.delete(e.pointerId);
	if (pointers.size < 2) {
		pinchDist = -1;
	}
	if (pointers.size === 1) {
		// A finger was lifted after a pinch. Re-baseline the pan state to the
		// remaining pointer's current position so continuing a drag doesn't
		// snap back to the pre-pinch translation.
		const remaining = [...pointers.values()][0];
		panStart = { x: remaining.x, y: remaining.y };
		panOrigin = { x: translateX, y: translateY };
		dragged = true;
	} else if (pointers.size === 0) {
		panStart = null;
		panOrigin = null;
	}
}

viewport.addEventListener('pointerup', endPointer);
viewport.addEventListener('pointercancel', endPointer);
window.addEventListener('pointerup', endPointer);
window.addEventListener('pointercancel', endPointer);

// Suppress clicks that happen right after a drag so panning doesn't trigger links
viewport.addEventListener('click', (e) => {
	if (dragged) {
		e.preventDefault();
		e.stopPropagation();
		dragged = false;
	}
}, true);

/* ------------------------------------------------------------------ */
/* Hover live coordinates                                              */
/* ------------------------------------------------------------------ */

viewport.addEventListener('pointermove', (e) => {
	if (pointers.size > 0) return;

	setCoords(e.clientX, e.clientY);
});