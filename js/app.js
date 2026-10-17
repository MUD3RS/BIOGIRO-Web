
'use strict';

/* =========================================
   BIOGIRO v2.0
   SISTEMA DE RECOLECCIÓN DE AVU
   Simulaciones académicas
========================================= */

// CONFIGURACIÓN GENERAL

const centroPachuca = [20.1211, -98.7355];
const capacidadVehiculo = 300;

const proveedoresSeleccionados = new Map();

let todosEstablecimientos = [];
let establecimientosVisibles = [];
let escenarioActivo = null;

let capaRecorrido = null;
let controladorRecorrido = null;
let solicitudRecorrido = 0;
let ordenMostrado = null;

const $ = id => document.getElementById(id);

// MAPA

const mapa = L.map('map').setView(centroPachuca, 14);

L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19
}).addTo(mapa);

const capaProveedores = L.featureGroup().addTo(mapa);

// ICONOS

const iconoProveedor = L.divIcon({
    className: 'marcador-biogiro',
    html: '<i class="bi bi-geo-alt-fill"></i>',
    iconSize: [34, 40],
    iconAnchor: [17, 40],
    popupAnchor: [0, -35]
});

const iconoProveedorSeleccionado = L.divIcon({
    className: 'marcador-biogiro marcador-seleccionado',
    html: '<i class="bi bi-geo-alt-fill"></i>',
    iconSize: [34, 40],
    iconAnchor: [17, 40],
    popupAnchor: [0, -35]
});

// VALIDACIONES

function coordenadaValida(p) {
    if (
        p.latitud === null ||
        p.longitud === null ||
        p.latitud === undefined ||
        p.longitud === undefined ||
        p.latitud === '' ||
        p.longitud === ''
    ) {
        return false;
    }

    const lat = Number(p.latitud);
    const lng = Number(p.longitud);

    return Number.isFinite(lat) &&
        Number.isFinite(lng) &&
        lat >= -90 &&
        lat <= 90 &&
        lng >= -180 &&
        lng <= 180;
}

function volumen(p) {
    if (
        p.avu_estimado === null ||
        p.avu_estimado === undefined ||
        p.avu_estimado === ''
    ) {
        return null;
    }

    const n = Number(p.avu_estimado);

    return Number.isFinite(n) && n >= 0 ? n : null;
}

function crearCelda(fila, valor) {
    const td = document.createElement('td');
    td.textContent = String(valor ?? '');
    fila.appendChild(td);
    return td;
}

// MARCADORES

function mostrarMarcadores(establecimientos, ajustarVista = true) {
    establecimientosVisibles = [...establecimientos];
    capaProveedores.clearLayers();

    establecimientos.forEach(p => {
        if (!coordenadaValida(p)) return;

        const seleccionado = proveedoresSeleccionados.has(
            String(p.id_denue)
        );

        const marker = L.marker([
            Number(p.latitud),
            Number(p.longitud)
        ], {
            icon: seleccionado
                ? iconoProveedorSeleccionado
                : iconoProveedor
        });

        const popup = document.createElement('div');
        popup.className = 'popup-biogiro';

        const titulo = document.createElement('h6');
        titulo.textContent = p.nombre || 'Sin nombre';
        popup.appendChild(titulo);

        const detalles = [
            `Actividad: ${p.actividad || 'No especificada'}`,
            `ID DENUE: ${p.id_denue || 'Sin dato'}`,
            `Dirección: ${p.direccion || 'No disponible'}`,
            `AVU: ${volumen(p) === null
                ? 'Sin evaluar'
                : `${volumen(p)} L (simulados)`}`,
            `Prioridad: ${p.prioridad || 'Sin evaluar'}`,
            `Ruta: ${p.ruta_simulada || 'Sin asignar'}`
        ];

        detalles.forEach(linea => {
            const el = document.createElement('p');
            el.textContent = linea;
            popup.appendChild(el);
        });

        marker.bindPopup(popup);
        capaProveedores.addLayer(marker);
    });

    if (
        ajustarVista &&
        capaProveedores.getLayers().length > 0
    ) {
        mapa.fitBounds(capaProveedores.getBounds(), {
            padding: [40, 40],
            maxZoom: 16
        });
    }
}

// TABLA

function mostrarEstablecimientos(establecimientos) {
    const tbody = $('tabla-establecimientos');
    tbody.replaceChildren();

    if (establecimientos.length === 0) {
        const tr = document.createElement('tr');
        const td = crearCelda(
            tr,
            'No se encontraron establecimientos.'
        );

        td.colSpan = 6;
        td.className = 'text-center text-muted py-4';

        tbody.appendChild(tr);
        return;
    }

    establecimientos.forEach(p => {
        const tr = document.createElement('tr');

        const tdSeleccion = document.createElement('td');
        const check = document.createElement('input');

        check.type = 'checkbox';
        check.className = 'checkbox-ruta';
        check.setAttribute(
            'aria-label',
            `Seleccionar ${p.nombre || p.id_denue}`
        );

        check.checked = proveedoresSeleccionados.has(
            String(p.id_denue)
        );

        check.addEventListener('change', () => {
            seleccionarProveedor(p, check.checked);
        });

        tdSeleccion.appendChild(check);
        tr.appendChild(tdSeleccion);

        crearCelda(tr, p.nombre || 'Sin nombre');
        crearCelda(tr, p.actividad || 'No especificada');

        crearCelda(
            tr,
            volumen(p) === null
                ? 'Pendiente'
                : `${volumen(p)} L`
        );

        const prioridadTd = document.createElement('td');
        const badge = document.createElement('span');

        const prioridad = p.prioridad || 'Sin evaluar';

        badge.className = 'priority-badge ' +
            (
                ['Alta', 'Media', 'Baja'].includes(prioridad)
                    ? prioridad.toLowerCase()
                    : ''
            );

        badge.textContent = prioridad;

        prioridadTd.appendChild(badge);
        tr.appendChild(prioridadTd);

        crearCelda(tr, p.estado || 'Prospecto');

        tbody.appendChild(tr);
    });
}

// FILTROS

function aplicarFiltros() {
    const q = $('buscar-establecimiento')
        .value.toLocaleLowerCase('es')
        .trim();

    const prioridad = $('filtro-prioridad').value;

    const resultados = todosEstablecimientos.filter(p => {
        const contenido = [
            p.nombre,
            p.actividad,
            p.id_denue
        ]
            .map(v => String(v || '').toLocaleLowerCase('es'))
            .join(' ');

        const coincideBusqueda = contenido.includes(q);

        const coincidePrioridad =
            prioridad === 'todos' ||
            (p.prioridad || 'Sin evaluar') === prioridad;

        return coincideBusqueda && coincidePrioridad;
    });

    mostrarEstablecimientos(resultados);
    mostrarMarcadores(resultados);

    $('contador-resultados').textContent =
        `${resultados.length} de ${todosEstablecimientos.length} resultados`;
}

// CONTROL DEL RECORRIDO

function invalidarRecorrido() {
    solicitudRecorrido++;

    if (controladorRecorrido) {
        controladorRecorrido.abort();
        controladorRecorrido = null;
    }

    if (capaRecorrido) {
        mapa.removeLayer(capaRecorrido);
        capaRecorrido = null;
    }

    ordenMostrado = null;

    $('ruta-distancia').textContent = 'Sin calcular';
    $('ruta-tiempo').textContent = 'Sin calcular';
    $('btn-calcular-recorrido').disabled = false;
}

// SELECCIÓN DE ESCENARIOS

function activarEscenario(letra) {
    escenarioActivo = letra;

    for (const clave of ['A', 'B']) {
        const btn = $(`btn-ruta-${clave.toLowerCase()}`);
        const activo = clave === letra;

        btn.classList.toggle('activa', activo);
        btn.setAttribute('aria-pressed', String(activo));
    }
}

function seleccionarProveedor(p, seleccionado) {
    invalidarRecorrido();
    activarEscenario(null);

    const id = String(p.id_denue);

    if (seleccionado) {
        proveedoresSeleccionados.set(id, p);
    } else {
        proveedoresSeleccionados.delete(id);
    }

    actualizarPanelRuta();
    mostrarMarcadores(establecimientosVisibles, false);

    $('estado-recorrido').textContent =
        'Selección manual modificada. Calcula nuevamente el recorrido.';
}

// CÁLCULO DE ACEITE

function calcularTotalSeleccionado() {
    let litros = 0;
    let pendientes = 0;

    for (const p of proveedoresSeleccionados.values()) {
        const n = volumen(p);

        if (n === null) {
            pendientes++;
        } else {
            litros += n;
        }
    }

    return { litros, pendientes };
}

// PANEL DE PLANIFICACIÓN

function actualizarPanelRuta() {
    const proveedores = [
        ...proveedoresSeleccionados.values()
    ];

    const { litros, pendientes } =
        calcularTotalSeleccionado();

    const porcentaje =
        litros / capacidadVehiculo * 100;

    $('ruta-total-paradas').textContent =
        proveedores.length;

    $('ruta-total-litros').textContent =
        `${litros.toFixed(1)} L`;

    $('ruta-capacidad').textContent =
        `${capacidadVehiculo} L`;

    $('ruta-porcentaje').textContent =
        `${porcentaje.toFixed(1)}%`;

    const progreso = $('ruta-progreso');

    progreso.style.width =
        `${Math.min(porcentaje, 100)}%`;

    progreso.setAttribute(
        'aria-valuenow',
        String(Math.min(porcentaje, 100))
    );

    progreso.classList.toggle(
        'bg-danger',
        porcentaje > 100
    );

    const lista = $('lista-ruta');
    lista.replaceChildren();

    if (proveedores.length === 0) {
        const li = document.createElement('li');

        li.textContent =
            'Selecciona establecimientos desde la tabla o carga una simulación.';

        lista.appendChild(li);
        return;
    }

    const orden = ordenMostrado || proveedores;

    orden.forEach(p => {
        const li = document.createElement('li');

        const nombre = document.createElement('span');
        nombre.className = 'stop-name';
        nombre.textContent = p.nombre || 'Sin nombre';

        const dato = document.createElement('span');
        dato.className = 'stop-volume';

        dato.textContent =
            volumen(p) === null
                ? 'Pendiente'
                : `${volumen(p)} L`;

        li.append(nombre, dato);
        lista.appendChild(li);
    });

    if (porcentaje > 100 || pendientes > 0) {
        const li = document.createElement('li');
        li.className = 'notice';

        li.textContent =
            porcentaje > 100
                ? 'La selección supera la capacidad del vehículo. Divídela en varios viajes.'
                : `${pendientes} parada(s) sin volumen evaluado.`;

        lista.appendChild(li);
    }
}

// VISUALIZAR SELECCIÓN

function mostrarSeleccionEnMapa() {
    const coords = [
        ...proveedoresSeleccionados.values()
    ]
        .filter(coordenadaValida)
        .map(p => [
            Number(p.latitud),
            Number(p.longitud)
        ]);

    if (coords.length === 0) {
        alert(
            'Selecciona al menos un establecimiento con coordenadas válidas.'
        );
        return;
    }

    $('mapa').scrollIntoView({
        behavior: 'smooth',
        block: 'start'
    });

    setTimeout(() => {
        mapa.invalidateSize();

        if (coords.length === 1) {
            mapa.setView(coords[0], 16);
        } else {
            mapa.fitBounds(L.latLngBounds(coords), {
                padding: [55, 55],
                maxZoom: 16
            });
        }
    }, 300);
}

// CARGAR RUTA A O B

function cargarRutaSimulada(letra) {
    if (todosEstablecimientos.length === 0) {
        alert('Todavía no se han cargado los datos.');
        return;
    }

    const grupo = todosEstablecimientos.filter(
        p => p.ruta_simulada === letra
    );

    if (grupo.length === 0) {
        alert(
            `El JSON no contiene establecimientos asignados a Ruta ${letra}.`
        );
        return;
    }

    invalidarRecorrido();
    proveedoresSeleccionados.clear();

    grupo.forEach(p => {
        proveedoresSeleccionados.set(
            String(p.id_denue),
            p
        );
    });

    activarEscenario(letra);

    $('buscar-establecimiento').value = '';
    $('filtro-prioridad').value = 'todos';

    aplicarFiltros();
    actualizarPanelRuta();

    $('estado-recorrido').textContent =
        `Ruta ${letra} cargada (${grupo.length} paradas). ` +
        'Pulsa "Calcular recorrido por calles".';

    mostrarSeleccionEnMapa();
}

// DISTANCIA GEOGRÁFICA

function distanciaGeografica(a, b) {
    const rad = grados => grados * Math.PI / 180;
    const radio = 6371000;

    const dLat = rad(b.latitud - a.latitud);
    const dLon = rad(b.longitud - a.longitud);

    const h =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(rad(a.latitud)) *
        Math.cos(rad(b.latitud)) *
        Math.sin(dLon / 2) ** 2;

    return 2 * radio *
        Math.asin(Math.min(1, Math.sqrt(h)));
}

// ORDENAR PARADAS POR CERCANÍA

function ordenarParadas(proveedores) {
    const pendientes = [...proveedores];

    pendientes.sort((a, b) =>
        Number(a.longitud) - Number(b.longitud) ||
        Number(a.latitud) - Number(b.latitud)
    );

    const orden = [pendientes.shift()];

    while (pendientes.length > 0) {
        const actual = orden[orden.length - 1];

        let mejor = 0;
        let menor = Infinity;

        pendientes.forEach((p, i) => {
            const distancia = distanciaGeografica(
                actual,
                p
            );

            if (distancia < menor) {
                menor = distancia;
                mejor = i;
            }
        });

        orden.push(
            pendientes.splice(mejor, 1)[0]
        );
    }

    return orden;
}

// CALCULAR RECORRIDO SOBRE CALLES

async function calcularRecorrido() {
    const proveedores = [
        ...proveedoresSeleccionados.values()
    ];

    if (proveedores.length < 2) {
        alert('Selecciona al menos dos establecimientos.');
        return;
    }

    if (!proveedores.every(coordenadaValida)) {
        alert(
            'Algún establecimiento no tiene coordenadas válidas.'
        );
        return;
    }

    const { litros, pendientes } =
        calcularTotalSeleccionado();

    if (litros > capacidadVehiculo) {
        alert(
            `La selección contiene ${litros} L y supera ` +
            `la capacidad de ${capacidadVehiculo} L.`
        );
        return;
    }

    if (pendientes > 0) {
        alert(
            'Hay establecimientos sin volumen estimado.'
        );
        return;
    }

    invalidarRecorrido();

    const solicitud = solicitudRecorrido;
    const controller = new AbortController();

    controladorRecorrido = controller;

    const orden = ordenarParadas(proveedores);

    const coords = orden
        .map(p =>
            `${Number(p.longitud)},${Number(p.latitud)}`
        )
        .join(';');

    const url =
        `https://router.project-osrm.org/route/v1/driving/${coords}` +
        '?overview=full&geometries=geojson&steps=false';

    $('btn-calcular-recorrido').disabled = true;

    $('estado-recorrido').textContent =
        'Consultando el trazado por calles...';

    try {
        const respuesta = await fetch(url, {
            signal: controller.signal
        });

        if (!respuesta.ok) {
            throw new Error(
                `Respuesta HTTP ${respuesta.status}`
            );
        }

        const datos = await respuesta.json();

        if (solicitud !== solicitudRecorrido) {
            return;
        }

        if (
            datos.code !== 'Ok' ||
            !datos.routes?.length
        ) {
            throw new Error(
                datos.message ||
                'No se encontró una ruta vial.'
            );
        }

        const ruta = datos.routes[0];

        if (!ruta.geometry?.coordinates?.length) {
            throw new Error(
                'La respuesta no incluye geometría vial.'
            );
        }

        const puntos = ruta.geometry.coordinates.map(
            ([lng, lat]) => [lat, lng]
        );

        capaRecorrido = L.polyline(puntos, {
            color: '#2563eb',
            weight: 6,
            opacity: 0.85
        }).addTo(mapa);

        ordenMostrado = orden;
        actualizarPanelRuta();

        $('ruta-distancia').textContent =
            `${(ruta.distance / 1000).toFixed(2)} km`;

        $('ruta-tiempo').textContent =
            `${Math.round(ruta.duration / 60)} min`;

        $('estado-recorrido').textContent =
            `Recorrido calculado con ${orden.length} paradas. ` +
            'El tiempo es solo de conducción, sin tráfico ni carga/descarga.';

        $('mapa').scrollIntoView({
            behavior: 'smooth',
            block: 'start'
        });

        setTimeout(() => {
            mapa.invalidateSize();

            if (capaRecorrido) {
                mapa.fitBounds(
                    capaRecorrido.getBounds(),
                    { padding: [45, 45] }
                );
            }
        }, 250);

    } catch (error) {
        if (
            solicitud !== solicitudRecorrido ||
            error.name === 'AbortError'
        ) {
            return;
        }

        console.error('Error de OSRM:', error);

        $('estado-recorrido').textContent =
            'No fue posible calcular el recorrido. ' +
            'Verifica Internet o inténtalo más tarde.';

    } finally {
        if (solicitud === solicitudRecorrido) {
            controladorRecorrido = null;
            $('btn-calcular-recorrido').disabled = false;
        }
    }
}

// CARGAR JSON

async function cargarEstablecimientos() {
    try {
        const respuesta = await fetch(
            'data/establecimientos.json',
            { cache: 'no-store' }
        );

        if (!respuesta.ok) {
            throw new Error(
                `No se pudo cargar el JSON: HTTP ${respuesta.status}`
            );
        }

        const datos = await respuesta.json();

        if (!Array.isArray(datos)) {
            throw new Error(
                'El JSON debe ser una lista de establecimientos.'
            );
        }

        todosEstablecimientos = datos;

        $('total-establecimientos').textContent =
            datos.length;

        const total = datos.reduce(
            (s, p) => s + (volumen(p) ?? 0),
            0
        );

        $('total-avu').textContent =
            `${total} L`;

        $('total-escenarios').textContent =
            new Set(
                datos
                    .map(p => p.ruta_simulada)
                    .filter(Boolean)
            ).size;

        for (const letra of ['A', 'B']) {
            const grupo = datos.filter(
                p => p.ruta_simulada === letra
            );

            const litros = grupo.reduce(
                (s, p) => s + (volumen(p) ?? 0),
                0
            );

            $(`resumen-ruta-${letra.toLowerCase()}`)
                .textContent =
                `${grupo.length} paradas · ${litros} L simulados`;
        }

        aplicarFiltros();
        actualizarPanelRuta();

        console.log(
            'BIOGIRO v2.0: establecimientos cargados',
            datos.length
        );

    } catch (error) {
        console.error(error);

        $('tabla-establecimientos').innerHTML =
            '<tr><td colspan="6">' +
            'No se pudieron cargar los establecimientos. ' +
            'Ejecuta con Live Server y revisa la consola.' +
            '</td></tr>';

        $('estado-recorrido').textContent =
            'Error al cargar data/establecimientos.json.';
    }
}

// EVENTOS

$('buscar-establecimiento').addEventListener(
    'input',
    aplicarFiltros
);

$('filtro-prioridad').addEventListener(
    'change',
    aplicarFiltros
);

$('btn-ruta-a').addEventListener('click', () => {
    cargarRutaSimulada('A');
});

$('btn-ruta-b').addEventListener('click', () => {
    cargarRutaSimulada('B');
});

$('btn-ver-seleccion').addEventListener(
    'click',
    mostrarSeleccionEnMapa
);

$('btn-calcular-recorrido').addEventListener(
    'click',
    calcularRecorrido
);

$('btn-limpiar-ruta').addEventListener('click', () => {
    invalidarRecorrido();

    proveedoresSeleccionados.clear();
    activarEscenario(null);

    mostrarEstablecimientos(establecimientosVisibles);
    mostrarMarcadores(establecimientosVisibles, false);

    actualizarPanelRuta();

    $('estado-recorrido').textContent =
        'Selección limpiada. Puedes cargar otra simulación.';
});

// INICIAR APLICACIÓN

cargarEstablecimientos();
