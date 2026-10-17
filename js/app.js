
'use strict';

/* ============================================
   BIOGIRO v2.1
   Recolección de aceite vegetal usado
   Planta + rutas circulares de recolección

   Prototipo académico
   Los volúmenes son simulados.
============================================ */

// CONFIGURACIÓN

const CONFIG = {
    centroMapa: [20.126, -98.734],
    capacidadVehiculo: 300,
    direccionPlanta:
        'Calle Mariano Abasolo 609, Centro, Pachuca de Soto, Hidalgo, México',
    geocodificacion:
        'https://nominatim.openstreetmap.org/search',
    servicioRutas:
        'https://router.project-osrm.org/route/v1/driving/'
};

const $ = id => document.getElementById(id);

let todosEstablecimientos = [];
let establecimientosVisibles = [];
let escenarioActivo = null;

const proveedoresSeleccionados = new Map();

let planta = null;
let marcadorPlanta = null;
let ajustePlantaActivo = false;

let capaRecorrido = null;
let controladorRecorrido = null;
let solicitudRecorrido = 0;
let ordenMostrado = null;

// ============================================
// MAPA
// ============================================

const mapa = L.map('map').setView(
    CONFIG.centroMapa,
    15
);

L.tileLayer(
    'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19
    }
).addTo(mapa);

const capaProveedores = L.featureGroup().addTo(mapa);

const iconoProveedor = L.divIcon({
    className: 'marcador-biogiro',
    html: '<i class="bi bi-geo-alt-fill"></i>',
    iconSize: [34, 40],
    iconAnchor: [17, 40],
    popupAnchor: [0, -35]
});

const iconoProveedorSeleccionado = L.divIcon({
    className:
        'marcador-biogiro marcador-seleccionado',
    html: '<i class="bi bi-geo-alt-fill"></i>',
    iconSize: [34, 40],
    iconAnchor: [17, 40],
    popupAnchor: [0, -35]
});

const iconoPlanta = L.divIcon({
    className: '',
    html: `
        <div style="
            width:48px;
            height:48px;
            border-radius:50%;
            background:#173c29;
            border:4px solid #ffffff;
            box-shadow:0 3px 12px #0005;
            display:flex;
            align-items:center;
            justify-content:center;
            color:white;
            font-size:23px;
        ">
            <i class="bi bi-building-gear"></i>
        </div>
    `,
    iconSize: [48, 48],
    iconAnchor: [24, 24],
    popupAnchor: [0, -24]
});

// ============================================
// PANEL DE LA PLANTA
// ============================================

function crearPanelPlanta() {
    const seccion = $('rutas');

    const panel = document.createElement('div');
    panel.id = 'panel-planta';

    panel.style.cssText = `
        padding:20px;
        margin-bottom:22px;
        border:1px solid #d7e7db;
        border-radius:14px;
        background:#f0f8f2;
    `;

    panel.innerHTML = `
        <div style="
            display:flex;
            align-items:center;
            gap:12px;
            margin-bottom:12px;
        ">
            <i class="bi bi-building-gear"
               style="font-size:27px;color:#2e7d32"></i>

            <div>
                <h3 style="
                    margin:0;
                    font-size:17px;
                    font-weight:750;
                ">
                    Planta de producción BIOGIRO
                </h3>

                <small style="color:#66776a">
                    Punto de salida y regreso de las rutas
                </small>
            </div>
        </div>

        <p style="
            font-size:13px;
            margin-bottom:8px;
        ">
            <strong>Dirección propuesta:</strong>
            ${CONFIG.direccionPlanta}
        </p>

        <p id="estado-planta"
           role="status"
           aria-live="polite"
           style="
               color:#64766a;
               font-size:12px;
               margin-bottom:12px;
           ">
            Buscando ubicación de la planta...
        </p>

        <div style="
            display:flex;
            gap:10px;
            flex-wrap:wrap;
        ">
            <button
                id="btn-ver-planta"
                type="button"
                class="btn btn-outline-success btn-sm"
                disabled>
                <i class="bi bi-geo-alt-fill"></i>
                Ver planta
            </button>

            <button
                id="btn-ajustar-planta"
                type="button"
                class="btn btn-outline-secondary btn-sm">
                <i class="bi bi-crosshair"></i>
                Ajustar ubicación en el mapa
            </button>
        </div>

        <p style="
            color:#738175;
            font-size:11px;
            margin:12px 0 0;
        ">
            Ubicación hipotética para fines académicos.
            Verifica el marcador antes de calcular los recorridos.
        </p>
    `;

    const encabezado = seccion.querySelector(
        '.section-heading'
    );

    encabezado.insertAdjacentElement(
        'afterend',
        panel
    );

    $('btn-ver-planta').addEventListener(
        'click',
        verPlanta
    );

    $('btn-ajustar-planta').addEventListener(
        'click',
        activarAjustePlanta
    );

    // Aclarar que las métricas incluyen el circuito.
    const etiquetaDistancia = $('ruta-distancia')
        .previousElementSibling;

    if (etiquetaDistancia) {
        etiquetaDistancia.textContent =
            'Distancia total del circuito';
    }

    const etiquetaTiempo = $('ruta-tiempo')
        .previousElementSibling;

    if (etiquetaTiempo) {
        etiquetaTiempo.textContent =
            'Conducción total estimada';
    }
}

// ============================================
// LOCALIZACIÓN DE LA PLANTA
// ============================================

function actualizarEstadoPlanta(mensaje) {
    $('estado-planta').textContent = mensaje;
}

function establecerPlanta(latitud, longitud, origen) {
    const lat = Number(latitud);
    const lng = Number(longitud);

    if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lng) ||
        lat < -90 || lat > 90 ||
        lng < -180 || lng > 180
    ) {
        throw new Error(
            'Coordenadas inválidas para la planta.'
        );
    }

    planta = {
        latitud: lat,
        longitud: lng,
        origen
    };

    if (marcadorPlanta) {
        marcadorPlanta.setLatLng([lat, lng]);
    } else {
        marcadorPlanta = L.marker(
            [lat, lng],
            {
                icon: iconoPlanta,
                zIndexOffset: 1000
            }
        ).addTo(mapa);
    }

    const popup = document.createElement('div');

    const titulo = document.createElement('strong');
    titulo.textContent = 'PLANTA BIOGIRO';

    const direccion = document.createElement('p');
    direccion.textContent =
        CONFIG.direccionPlanta;

    const nota = document.createElement('small');
    nota.textContent =
        'Ubicación hipotética. Inicio y fin del recorrido.';

    popup.append(titulo, direccion, nota);

    marcadorPlanta.bindPopup(popup);

    $('btn-ver-planta').disabled = false;

    actualizarEstadoPlanta(
        `Ubicación ${origen}: ` +
        `${lat.toFixed(6)}, ${lng.toFixed(6)}`
    );

    invalidarRecorrido();

    if (proveedoresSeleccionados.size > 0) {
        $('estado-recorrido').textContent =
            'Se actualizó la ubicación de la planta. ' +
            'Calcula nuevamente el recorrido.';
    }
}

async function buscarPlanta() {
    actualizarEstadoPlanta(
        'Buscando la dirección de la planta...'
    );

    try {
        const parametros = new URLSearchParams({
            q: CONFIG.direccionPlanta,
            format: 'json',
            limit: '5',
            countrycodes: 'mx',
            addressdetails: '1'
        });

        const respuesta = await fetch(
            `${CONFIG.geocodificacion}?${parametros}`
        );

        if (!respuesta.ok) {
            throw new Error(
                `Error HTTP ${respuesta.status}`
            );
        }

        const resultados = await respuesta.json();

        // Aceptar únicamente resultados próximos
        // a la zona central de Pachuca.
        const resultado = resultados.find(item => {
            const lat = Number(item.lat);
            const lng = Number(item.lon);

            return (
                lat >= 20.10 &&
                lat <= 20.15 &&
                lng >= -98.77 &&
                lng <= -98.70
            );
        });

        if (!resultado) {
            throw new Error(
                'No se encontró una coincidencia confiable en Pachuca Centro.'
            );
        }

        establecerPlanta(
            resultado.lat,
            resultado.lon,
            'aproximada por dirección'
        );

        // Centrar la planta para revisión visual.
        mapa.setView(
            [
                Number(resultado.lat),
                Number(resultado.lon)
            ],
            16
        );

    } catch (error) {
        console.warn(
            'No se pudo localizar la planta:',
            error
        );

        actualizarEstadoPlanta(
            'No fue posible ubicar la planta automáticamente. ' +
            'Pulsa "Ajustar ubicación en el mapa" ' +
            'y selecciona el punto correcto.'
        );
    }
}

function verPlanta() {
    if (!planta) {
        alert(
            'Primero debes ubicar la planta.'
        );
        return;
    }

    $('mapa').scrollIntoView({
        behavior: 'smooth',
        block: 'start'
    });

    setTimeout(() => {
        mapa.invalidateSize();

        mapa.setView(
            [
                planta.latitud,
                planta.longitud
            ],
            17
        );

        marcadorPlanta.openPopup();
    }, 300);
}

function activarAjustePlanta() {
    ajustePlantaActivo = !ajustePlantaActivo;

    const boton = $('btn-ajustar-planta');

    if (ajustePlantaActivo) {
        boton.classList.remove(
            'btn-outline-secondary'
        );

        boton.classList.add('btn-warning');

        boton.innerHTML =
            '<i class="bi bi-x-circle"></i> Cancelar ajuste';

        actualizarEstadoPlanta(
            'Haz clic en el mapa sobre la entrada ' +
            'de la planta para establecer su ubicación.'
        );

        $('mapa').scrollIntoView({
            behavior: 'smooth'
        });

    } else {
        finalizarAjustePlanta();
    }
}

function finalizarAjustePlanta() {
    ajustePlantaActivo = false;

    const boton = $('btn-ajustar-planta');

    boton.classList.remove('btn-warning');
    boton.classList.add(
        'btn-outline-secondary'
    );

    boton.innerHTML =
        '<i class="bi bi-crosshair"></i> ' +
        'Ajustar ubicación en el mapa';

    if (planta) {
        actualizarEstadoPlanta(
            `Ubicación ${planta.origen}: ` +
            `${planta.latitud.toFixed(6)}, ` +
            `${planta.longitud.toFixed(6)}`
        );
    }
}

mapa.on('click', evento => {
    if (!ajustePlantaActivo) return;

    establecerPlanta(
        evento.latlng.lat,
        evento.latlng.lng,
        'ajustada manualmente'
    );

    finalizarAjustePlanta();

    marcadorPlanta.openPopup();
});

// ============================================
// DATOS Y VALIDACIONES
// ============================================

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

    return (
        Number.isFinite(lat) &&
        Number.isFinite(lng) &&
        lat >= -90 &&
        lat <= 90 &&
        lng >= -180 &&
        lng <= 180
    );
}

function volumen(p) {
    if (
        p.avu_estimado === null ||
        p.avu_estimado === undefined ||
        p.avu_estimado === ''
    ) {
        return null;
    }

    const numero = Number(p.avu_estimado);

    return Number.isFinite(numero) &&
        numero >= 0
        ? numero
        : null;
}

function crearCelda(fila, valor) {
    const celda = document.createElement('td');

    celda.textContent = String(
        valor ?? ''
    );

    fila.appendChild(celda);

    return celda;
}

// ============================================
// MARCADORES DE ESTABLECIMIENTOS
// ============================================

function mostrarMarcadores(
    establecimientos,
    ajustarVista = true
) {
    establecimientosVisibles = [
        ...establecimientos
    ];

    capaProveedores.clearLayers();

    establecimientos.forEach(p => {
        if (!coordenadaValida(p)) return;

        const seleccionado =
            proveedoresSeleccionados.has(
                String(p.id_denue)
            );

        const marcador = L.marker(
            [
                Number(p.latitud),
                Number(p.longitud)
            ],
            {
                icon: seleccionado
                    ? iconoProveedorSeleccionado
                    : iconoProveedor
            }
        );

        const popup = document.createElement('div');
        popup.className = 'popup-biogiro';

        const titulo = document.createElement('h6');
        titulo.textContent =
            p.nombre || 'Sin nombre';

        popup.appendChild(titulo);

        const detalles = [
            `Actividad: ${p.actividad || 'No especificada'}`,
            `ID DENUE: ${p.id_denue || 'Sin dato'}`,
            `Dirección: ${p.direccion || 'No disponible'}`,
            `AVU: ${
                volumen(p) === null
                    ? 'Sin evaluar'
                    : volumen(p) + ' L simulados'
            }`,
            `Prioridad: ${p.prioridad || 'Sin evaluar'}`,
            `Ruta: ${p.ruta_simulada || 'Sin asignar'}`
        ];

        detalles.forEach(texto => {
            const elemento = document.createElement('p');

            elemento.textContent = texto;
            popup.appendChild(elemento);
        });

        marcador.bindPopup(popup);

        capaProveedores.addLayer(marcador);
    });

    if (
        ajustarVista &&
        capaProveedores.getLayers().length
    ) {
        mapa.fitBounds(
            capaProveedores.getBounds(),
            {
                padding: [40, 40],
                maxZoom: 16
            }
        );
    }
}

// ============================================
// TABLA DE ESTABLECIMIENTOS
// ============================================

function mostrarEstablecimientos(
    establecimientos
) {
    const tbody = $('tabla-establecimientos');

    tbody.replaceChildren();

    if (!establecimientos.length) {
        const fila = document.createElement('tr');

        const celda = crearCelda(
            fila,
            'No se encontraron establecimientos.'
        );

        celda.colSpan = 6;
        celda.className =
            'text-center text-muted py-4';

        tbody.appendChild(fila);

        return;
    }

    establecimientos.forEach(p => {
        const fila = document.createElement('tr');

        const tdCheck = document.createElement('td');
        const check = document.createElement('input');

        check.type = 'checkbox';
        check.className = 'checkbox-ruta';

        check.setAttribute(
            'aria-label',
            `Seleccionar ${p.nombre || p.id_denue}`
        );

        check.checked =
            proveedoresSeleccionados.has(
                String(p.id_denue)
            );

        check.addEventListener('change', () => {
            seleccionarProveedor(
                p,
                check.checked
            );
        });

        tdCheck.appendChild(check);
        fila.appendChild(tdCheck);

        crearCelda(
            fila,
            p.nombre || 'Sin nombre'
        );

        crearCelda(
            fila,
            p.actividad || 'No especificada'
        );

        crearCelda(
            fila,
            volumen(p) === null
                ? 'Pendiente'
                : `${volumen(p)} L`
        );

        const tdPrioridad =
            document.createElement('td');

        const badge =
            document.createElement('span');

        const prioridad =
            p.prioridad || 'Sin evaluar';

        const clase =
            ['Alta', 'Media', 'Baja']
                .includes(prioridad)
                ? prioridad.toLowerCase()
                : '';

        badge.className =
            `priority-badge ${clase}`;

        badge.textContent = prioridad;

        tdPrioridad.appendChild(badge);
        fila.appendChild(tdPrioridad);

        crearCelda(
            fila,
            p.estado || 'Prospecto'
        );

        tbody.appendChild(fila);
    });
}

// ============================================
// BÚSQUEDA Y FILTROS
// ============================================

function aplicarFiltros() {
    const busqueda = $('buscar-establecimiento')
        .value
        .toLocaleLowerCase('es')
        .trim();

    const prioridad =
        $('filtro-prioridad').value;

    const resultados =
        todosEstablecimientos.filter(p => {
            const contenido = [
                p.nombre,
                p.actividad,
                p.id_denue
            ]
                .map(valor =>
                    String(valor || '')
                        .toLocaleLowerCase('es')
                )
                .join(' ');

            const coincideBusqueda =
                contenido.includes(busqueda);

            const coincidePrioridad =
                prioridad === 'todos' ||
                (p.prioridad || 'Sin evaluar') === prioridad;

            return (
                coincideBusqueda &&
                coincidePrioridad
            );
        });

    mostrarEstablecimientos(resultados);
    mostrarMarcadores(resultados);

    $('contador-resultados').textContent =
        `${resultados.length} de ` +
        `${todosEstablecimientos.length} resultados`;
}

// ============================================
// CONTROL DE RECORRIDOS
// ============================================

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

    $('ruta-distancia').textContent =
        'Sin calcular';

    $('ruta-tiempo').textContent =
        'Sin calcular';

    $('btn-calcular-recorrido').disabled =
        false;
}

function activarEscenario(letra) {
    escenarioActivo = letra;

    for (const clave of ['A', 'B']) {
        const boton = $(
            `btn-ruta-${clave.toLowerCase()}`
        );

        const activo = clave === letra;

        boton.classList.toggle(
            'activa',
            activo
        );

        boton.setAttribute(
            'aria-pressed',
            String(activo)
        );
    }
}

function seleccionarProveedor(
    proveedor,
    seleccionado
) {
    invalidarRecorrido();
    activarEscenario(null);

    const id = String(
        proveedor.id_denue
    );

    if (seleccionado) {
        proveedoresSeleccionados.set(
            id,
            proveedor
        );
    } else {
        proveedoresSeleccionados.delete(id);
    }

    actualizarPanelRuta();

    mostrarMarcadores(
        establecimientosVisibles,
        false
    );

    $('estado-recorrido').textContent =
        'Selección modificada. Calcula nuevamente ' +
        'el circuito desde la planta.';
}

// ============================================
// CAPACIDAD Y VOLUMEN
// ============================================

function calcularTotalSeleccionado() {
    let litros = 0;
    let pendientes = 0;

    for (
        const proveedor of
        proveedoresSeleccionados.values()
    ) {
        const valor = volumen(proveedor);

        if (valor === null) {
            pendientes++;
        } else {
            litros += valor;
        }
    }

    return {
        litros,
        pendientes
    };
}

function actualizarPanelRuta() {
    const proveedores = [
        ...proveedoresSeleccionados.values()
    ];

    const { litros, pendientes } =
        calcularTotalSeleccionado();

    const porcentaje =
        litros / CONFIG.capacidadVehiculo * 100;

    $('ruta-total-paradas').textContent =
        proveedores.length;

    $('ruta-total-litros').textContent =
        `${litros.toFixed(1)} L`;

    $('ruta-capacidad').textContent =
        `${CONFIG.capacidadVehiculo} L`;

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

    if (!proveedores.length) {
        const li = document.createElement('li');

        li.textContent =
            'Selecciona establecimientos o carga una simulación.';

        lista.appendChild(li);
        return;
    }

    const orden = ordenMostrado || proveedores;

    // Mostrar planta como origen y destino
    if (planta) {
        agregarParadaEspecial(
            lista,
            'Salida: Planta BIOGIRO'
        );
    }

    orden.forEach(p => {
        const li = document.createElement('li');

        const nombre = document.createElement('span');
        nombre.className = 'stop-name';

        nombre.textContent =
            p.nombre || 'Sin nombre';

        const dato = document.createElement('span');
        dato.className = 'stop-volume';

        dato.textContent =
            volumen(p) === null
                ? 'Pendiente'
                : `${volumen(p)} L`;

        li.append(nombre, dato);

        lista.appendChild(li);
    });

    if (planta) {
        agregarParadaEspecial(
            lista,
            'Regreso: Planta BIOGIRO'
        );
    }

    if (
        porcentaje > 100 ||
        pendientes > 0
    ) {
        const li = document.createElement('li');
        li.className = 'notice';

        li.textContent =
            porcentaje > 100
                ? 'La selección supera la capacidad del vehículo.'
                : `${pendientes} parada(s) sin volumen evaluado.`;

        lista.appendChild(li);
    }
}

function agregarParadaEspecial(
    lista,
    nombre
) {
    const li = document.createElement('li');

    const texto = document.createElement('span');
    texto.className = 'stop-name';
    texto.textContent = nombre;

    const etiqueta = document.createElement('span');
    etiqueta.className = 'stop-volume';
    etiqueta.textContent = 'Planta';

    li.style.background = '#e7f5e9';
    li.style.borderColor = '#b6d9bd';

    li.append(texto, etiqueta);
    lista.appendChild(li);
}

// ============================================
// VER SELECCIÓN EN EL MAPA
// ============================================

function mostrarSeleccionEnMapa() {
    const coordenadas = [
        ...proveedoresSeleccionados.values()
    ]
        .filter(coordenadaValida)
        .map(p => [
            Number(p.latitud),
            Number(p.longitud)
        ]);

    if (planta) {
        coordenadas.push([
            planta.latitud,
            planta.longitud
        ]);
    }

    if (!coordenadas.length) {
        alert(
            'Selecciona establecimientos con coordenadas válidas.'
        );
        return;
    }

    $('mapa').scrollIntoView({
        behavior: 'smooth',
        block: 'start'
    });

    setTimeout(() => {
        mapa.invalidateSize();

        if (coordenadas.length === 1) {
            mapa.setView(
                coordenadas[0],
                16
            );
        } else {
            mapa.fitBounds(
                L.latLngBounds(coordenadas),
                {
                    padding: [55, 55],
                    maxZoom: 16
                }
            );
        }
    }, 300);
}

// ============================================
// CARGAR RUTAS A Y B
// ============================================

function cargarRutaSimulada(letra) {
    if (!todosEstablecimientos.length) {
        alert(
            'Los datos todavía no se han cargado.'
        );
        return;
    }

    const grupo =
        todosEstablecimientos.filter(
            p => p.ruta_simulada === letra
        );

    if (!grupo.length) {
        alert(
            `No existen proveedores para la Ruta ${letra}.`
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
        `Ruta ${letra} cargada con ${grupo.length} ` +
        'establecimientos. Calcula el circuito ' +
        'desde la planta.';

    mostrarSeleccionEnMapa();
}

// ============================================
// DISTANCIA GEOGRÁFICA
// ============================================

function distanciaGeografica(a, b) {
    const radianes = grados =>
        grados * Math.PI / 180;

    const radioTierra = 6371000;

    const dLat = radianes(
        Number(b.latitud) -
        Number(a.latitud)
    );

    const dLon = radianes(
        Number(b.longitud) -
        Number(a.longitud)
    );

    const lat1 = radianes(
        Number(a.latitud)
    );

    const lat2 = radianes(
        Number(b.latitud)
    );

    const h =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1) *
        Math.cos(lat2) *
        Math.sin(dLon / 2) ** 2;

    return (
        2 *
        radioTierra *
        Math.asin(
            Math.min(1, Math.sqrt(h))
        )
    );
}

// ============================================
// ORDEN DE PARADAS DESDE LA PLANTA
// ============================================

function ordenarParadas(proveedores) {
    if (!planta) {
        return [...proveedores];
    }

    const pendientes = [
        ...proveedores
    ];

    const orden = [];

    // A diferencia de v2.0, la primera
    // referencia es la planta.
    let actual = planta;

    while (pendientes.length > 0) {
        let mejorIndice = 0;
        let menorDistancia = Infinity;

        pendientes.forEach((p, indice) => {
            const distancia =
                distanciaGeografica(
                    actual,
                    p
                );

            if (distancia < menorDistancia) {
                menorDistancia = distancia;
                mejorIndice = indice;
            }
        });

        const siguiente =
            pendientes.splice(
                mejorIndice,
                1
            )[0];

        orden.push(siguiente);
        actual = siguiente;
    }

    return orden;
}

// ============================================
// CALCULAR CIRCUITO COMPLETO
// ============================================

async function calcularRecorrido() {
    if (!planta) {
        alert(
            'Primero debes ubicar la planta. ' +
            'Puedes utilizar el botón de ajuste sobre el mapa.'
        );
        return;
    }

    const proveedores = [
        ...proveedoresSeleccionados.values()
    ];

    if (proveedores.length < 1) {
        alert(
            'Selecciona al menos un establecimiento.'
        );
        return;
    }

    if (!proveedores.every(coordenadaValida)) {
        alert(
            'Existen establecimientos sin coordenadas válidas.'
        );
        return;
    }

    const { litros, pendientes } =
        calcularTotalSeleccionado();

    if (litros > CONFIG.capacidadVehiculo) {
        alert(
            `La selección contiene ${litros} L. ` +
            `La capacidad máxima es ` +
            `${CONFIG.capacidadVehiculo} L.`
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

    const solicitudActual =
        solicitudRecorrido;

    const controller =
        new AbortController();

    controladorRecorrido = controller;

    const orden =
        ordenarParadas(proveedores);

    // CIRCUITO:
    // PLANTA -> PROVEEDORES -> PLANTA
    const puntosRuta = [
        planta,
        ...orden,
        planta
    ];

    const coordenadas = puntosRuta
        .map(p => {
            const lat = Number(p.latitud);
            const lng = Number(p.longitud);

            return `${lng},${lat}`;
        })
        .join(';');

    const url =
        CONFIG.servicioRutas +
        coordenadas +
        '?overview=full' +
        '&geometries=geojson' +
        '&steps=false';

    const boton = $('btn-calcular-recorrido');

    boton.disabled = true;

    $('estado-recorrido').textContent =
        'Calculando circuito: Planta → ' +
        'establecimientos → Planta...';

    try {
        const respuesta = await fetch(
            url,
            {
                signal: controller.signal
            }
        );

        if (!respuesta.ok) {
            throw new Error(
                `Error HTTP ${respuesta.status}`
            );
        }

        const datos =
            await respuesta.json();

        if (
            solicitudActual !== solicitudRecorrido
        ) {
            return;
        }

        if (
            datos.code !== 'Ok' ||
            !datos.routes?.length
        ) {
            throw new Error(
                datos.message ||
                'No se encontró un recorrido.'
            );
        }

        const ruta = datos.routes[0];

        if (
            !ruta.geometry ||
            !ruta.geometry.coordinates ||
            !ruta.geometry.coordinates.length
        ) {
            throw new Error(
                'El servicio no devolvió geometría.'
            );
        }

        const puntos = ruta.geometry
            .coordinates
            .map(([lng, lat]) => [
                lat,
                lng
            ]);

        capaRecorrido = L.polyline(
            puntos,
            {
                color: '#2563eb',
                weight: 6,
                opacity: 0.9
            }
        ).addTo(mapa);

        ordenMostrado = orden;

        actualizarPanelRuta();

        const kilometros =
            ruta.distance / 1000;

        const minutos =
            ruta.duration / 60;

        $('ruta-distancia').textContent =
            `${kilometros.toFixed(2)} km`;

        $('ruta-tiempo').textContent =
            `${Math.round(minutos)} min`;

        const nombreEscenario =
            escenarioActivo
                ? `Ruta ${escenarioActivo}`
                : 'Ruta personalizada';

        $('estado-recorrido').textContent =
            `${nombreEscenario}: circuito completo ` +
            `desde la planta, con ${orden.length} ` +
            'establecimientos y regreso a la planta. ' +
            'Tiempo de conducción sin tráfico ' +
            'ni operaciones de carga.';

        $('mapa').scrollIntoView({
            behavior: 'smooth',
            block: 'start'
        });

        setTimeout(() => {
            mapa.invalidateSize();

            if (capaRecorrido) {
                mapa.fitBounds(
                    capaRecorrido.getBounds(),
                    {
                        padding: [45, 45]
                    }
                );
            }
        }, 250);

    } catch (error) {
        if (
            solicitudActual !== solicitudRecorrido ||
            error.name === 'AbortError'
        ) {
            return;
        }

        console.error(
            'Error al calcular circuito:',
            error
        );

        $('estado-recorrido').textContent =
            'No fue posible calcular el circuito. ' +
            'Verifica tu conexión y vuelve a intentar. ' +
            'El servicio público puede estar ocupado.';

    } finally {
        if (
            solicitudActual === solicitudRecorrido
        ) {
            controladorRecorrido = null;
            boton.disabled = false;
        }
    }
}

// ============================================
// CARGAR ESTABLECIMIENTOS
// ============================================

async function cargarEstablecimientos() {
    try {
        const respuesta = await fetch(
            'data/establecimientos.json',
            {
                cache: 'no-store'
            }
        );

        if (!respuesta.ok) {
            throw new Error(
                `Error HTTP ${respuesta.status}`
            );
        }

        const datos =
            await respuesta.json();

        if (!Array.isArray(datos)) {
            throw new Error(
                'El JSON debe contener un arreglo.'
            );
        }

        todosEstablecimientos = datos;

        $('total-establecimientos').textContent =
            datos.length;

        const total = datos.reduce(
            (suma, p) =>
                suma + (volumen(p) ?? 0),
            0
        );

        $('total-avu').textContent =
            `${total} L`;

        const escenarios = new Set(
            datos
                .map(p => p.ruta_simulada)
                .filter(Boolean)
        );

        $('total-escenarios').textContent =
            escenarios.size;

        for (const letra of ['A', 'B']) {
            const grupo = datos.filter(
                p => p.ruta_simulada === letra
            );

            const litros = grupo.reduce(
                (suma, p) =>
                    suma + (volumen(p) ?? 0),
                0
            );

            const resumen = $(
                `resumen-ruta-${letra.toLowerCase()}`
            );

            resumen.textContent =
                `${grupo.length} paradas · ` +
                `${litros} L simulados`;
        }

        aplicarFiltros();
        actualizarPanelRuta();

        console.log(
            'BIOGIRO v2.1 cargado:',
            datos.length,
            'establecimientos'
        );

    } catch (error) {
        console.error(
            'Error al cargar establecimientos:',
            error
        );

        const tbody =
            $('tabla-establecimientos');

        tbody.replaceChildren();

        const fila =
            document.createElement('tr');

        const celda = crearCelda(
            fila,
            'No se pudieron cargar los establecimientos. ' +
            'Ejecuta con Live Server y revisa la consola.'
        );

        celda.colSpan = 6;

        tbody.appendChild(fila);

        $('estado-recorrido').textContent =
            'Error al cargar establecimientos.json.';
    }
}

// ============================================
// EVENTOS
// ============================================

$('buscar-establecimiento')
    .addEventListener(
        'input',
        aplicarFiltros
    );

$('filtro-prioridad')
    .addEventListener(
        'change',
        aplicarFiltros
    );

$('btn-ruta-a')
    .addEventListener('click', () => {
        cargarRutaSimulada('A');
    });

$('btn-ruta-b')
    .addEventListener('click', () => {
        cargarRutaSimulada('B');
    });

$('btn-ver-seleccion')
    .addEventListener(
        'click',
        mostrarSeleccionEnMapa
    );

$('btn-calcular-recorrido')
    .addEventListener(
        'click',
        calcularRecorrido
    );

$('btn-limpiar-ruta')
    .addEventListener('click', () => {
        invalidarRecorrido();

        proveedoresSeleccionados.clear();

        activarEscenario(null);

        mostrarEstablecimientos(
            establecimientosVisibles
        );

        mostrarMarcadores(
            establecimientosVisibles,
            false
        );

        actualizarPanelRuta();

        $('estado-recorrido').textContent =
            'Selección limpiada. Puedes cargar ' +
            'otra simulación.';
    });

// ============================================
// INICIALIZACIÓN
// ============================================

crearPanelPlanta();
cargarEstablecimientos();
buscarPlanta();
