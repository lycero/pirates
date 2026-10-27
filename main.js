class Constants {
	static CloudOpacity = 0.75;
	static FullOpacityZoom = 1.5;
	static MinOpacityZoom = 3;
	static FocusZoom = 8;
}

const MAP_WIDTH = 1615;
const MAP_HEIGHT = 1000;

const viewport = document.getElementById('viewport');
const mapContent = document.getElementById('map-content');
const coordsEl = document.getElementById('coords');

let scale = 1;
let translateX = 0;
let translateY = 0;
let fadeElements = [];
let mapObjects = [];
let focusAnimation = null;
let activePointerId = null;
let panStart = null;
let panOrigin = null;
let dragged = false;

async function loadMapObjects() {
  try {
    const responses = await Promise.all([
      fetch('deco.json'),
      fetch('isles.json'),
      fetch('clouds.json'),
    ]);
    const [deco, isles, clouds] = await Promise.all(
      responses.map(response => response.json())
    );

    [...deco, ...isles, ...clouds].forEach(obj => {
      const element = createMapObject(obj);
      mapContent.appendChild(element);
      mapObjects.push({ obj, element });
    });

    fadeElements = document.querySelectorAll('.fade-element');
    buildIsleMenu(isles);

    centerOnMapPoint(1050, 450);
    updateOpacity(scale);
  } catch (error) {
    console.error('Failed to load map objects:', error);
  }
}

function centerOnMapPoint(mapX, mapY) {
  const rect = viewport.getBoundingClientRect();
  translateX = rect.width / 2 - mapX * scale;
  translateY = rect.height / 2 - mapY * scale;
  updateTransform();
}

function buildIsleMenu(objects) {
  const list = document.getElementById('isle-menu-list');
  if (!list) return;

  objects
    .filter(obj => obj.type === 'image' && obj.alt && obj.alt !== 'waves')
    .forEach(obj => {
      list.appendChild(createMenuItem(obj.alt, () => focusIsle(obj)));
    });

  const resetItem = createMenuItem('Whole map', resetMapView);
  resetItem.querySelector('button').setAttribute('aria-pressed', 'true');
  list.appendChild(resetItem);
}

function createMenuItem(label, onClick) {
  const item = document.createElement('li');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'isle-menu-button';
  button.textContent = label;
  button.setAttribute('aria-pressed', 'false');
  button.addEventListener('click', () => {
    setActiveMenuButton(button);
    onClick();
  });
  item.appendChild(button);
  return item;
}

function setActiveMenuButton(activeButton) {
  document.querySelectorAll('.isle-menu-button').forEach(button => {
    button.setAttribute('aria-pressed', String(button === activeButton));
  });
}

function focusIsle(obj) {
  const entry = mapObjects.find(item => item.obj === obj);
  if (!entry) return;

  const img = entry.element.querySelector('img');
  const width = Math.max(img?.offsetWidth || Number(obj.size.width) || 1, 1);
  const height = Math.max(img?.offsetHeight || width, 1);

  const rect = viewport.getBoundingClientRect();
  const targetScale = Math.min(
    Constants.FocusZoom,
    Math.max(1.5, Math.min(
      (rect.width * 0.55) / width,
      (rect.height * 0.55) / height
    ))
  );

  animateMapTo(
    Number(obj.position.left),
    Number(obj.position.top) + height / 2,
    targetScale
  );
}

function resetMapView() {
  animateMapTo(1050, 450, 1);
}

function animateMapTo(mapX, mapY, targetScale) {
  if (focusAnimation !== null) {
    cancelAnimationFrame(focusAnimation);
  }

  const rect = viewport.getBoundingClientRect();
  const endX = rect.width / 2 - mapX * targetScale;
  const endY = rect.height / 2 - mapY * targetScale;
  const startX = translateX;
  const startY = translateY;
  const startScale = scale;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const duration = reducedMotion ? 0 : 650;
  const startTime = performance.now();

  function step(now) {
    const progress = duration === 0
      ? 1
      : Math.min((now - startTime) / duration, 1);
    const eased = progress < 0.5
      ? 4 * progress * progress * progress
      : 1 - Math.pow(-2 * progress + 2, 3) / 2;

    scale = startScale + (targetScale - startScale) * eased;
    translateX = startX + (endX - startX) * eased;
    translateY = startY + (endY - startY) * eased;
    updateTransform();
    updateOpacity(scale);

    if (progress < 1) {
      focusAnimation = requestAnimationFrame(step);
    } else {
      focusAnimation = null;
    }
  }

  focusAnimation = requestAnimationFrame(step);
}

function createMapObject(obj) {
	if (obj.type === 'clouds') {
		const img = document.createElement('img');
		img.src = obj.src;
		img.alt = obj.alt || '';
		img.draggable = false;
		img.style.position = 'absolute';
		img.style.left = `${obj.position.left}px`;
		img.style.top = `${obj.position.top}px`;
		img.style.width =`${obj.size.width}px`;
		img.style.height = `${obj.size.height}px`;
		if (obj.classes) {
			obj.classes.forEach(cls => img.classList.add(cls));
		}
		return img;
	}
  if (obj.type === 'image') {
    const container = document.createElement('div');
    container.style.position = 'absolute';

    const isFixed = obj.fixedPosition !== false;
    if (isFixed) {
      container.style.left = `${obj.position.left}px`;
      container.style.top = `${obj.position.top}px`;
    } else {
      container.style.left = obj.position.left;
      container.style.top = obj.position.top;
    }
    container.style.transform = 'translate(-50%, 0)';

    const img = document.createElement('img');
    img.src = obj.src;
    img.alt = obj.alt || '';
    img.draggable = false;

    if (isFixed) {
      img.style.width = `${obj.size.width}px`;
      img.style.height = `${obj.size.height}px`;
    } else {
      img.style.width = obj.size.width;
      img.style.height = obj.size.height;
    }

    if (obj.classes) {
      obj.classes.forEach(cls => img.classList.add(cls));
    }

    container.appendChild(img);

    if (obj.alt) {
      const label = document.createElement('span');
      label.className = 'map-label';
      label.textContent = obj.alt;
      container.appendChild(label);
    }

    if (obj.href) {
      const link = document.createElement('a');
      link.href = obj.href;
      link.appendChild(container);
      return link;
    }

    return container;
  }
  return document.createElement('div');
}

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

viewport.addEventListener('pointerdown', (e) => {
	if (e.pointerType === 'mouse' && e.button !== 0) return;
	if (e.target.closest('.isle-menu')) {
		dragged = false;
		return;
	}
	if (activePointerId !== null) return;

	if (focusAnimation !== null) {
		cancelAnimationFrame(focusAnimation);
		focusAnimation = null;
	}

	activePointerId = e.pointerId;
	panStart = { x: e.clientX, y: e.clientY };
	panOrigin = { x: translateX, y: translateY };
	dragged = false;

	try {
		viewport.setPointerCapture(e.pointerId);
	} catch (err) {
		// Pointer may already be gone; ignore
	}
});

viewport.addEventListener('pointermove', (e) => {
	if (e.pointerId !== activePointerId || !panStart || !panOrigin) return;

	// Pan: 1:1 screen-space movement
	const dx = e.clientX - panStart.x;
	const dy = e.clientY - panStart.y;
	if (Math.abs(dx) + Math.abs(dy) > 8) {
		dragged = true;
	}
	translateX = panOrigin.x + dx;
	translateY = panOrigin.y + dy;
	updateTransform();
});

function endPointer(e) {
	if (e.pointerId !== activePointerId) return;
	activePointerId = null;
	panStart = null;
	panOrigin = null;
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
	if (activePointerId !== null) return;

	setCoords(e.clientX, e.clientY);
});

loadMapObjects();
