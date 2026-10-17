
'use strict';

/*
  BIOGIRO v2.2
  Simulación de recolección de AVU.
  Circuitos con planta, comparación y reportes CSV.
  Todos los volúmenes son estimaciones académicas.
*/

const CONFIG = {
    centro: [20.126, -98.734],
    capacidad: 300,
    direccionPlanta:
        'Calle Mariano Abasolo 609, Centro, Pachuca de Soto, Hidalgo, México',
    nominatim: 'https://nominatim.openstreetmap.org/search',
    osrm: 'https://router.project-osrm.org/route/v1/driving/'
};

const $ = id => document.getElementById(id);

let establecimientos = [];
let visibles = [];
let escenario = null;
let planta = null;
let marcadorPlanta = null;
let ajustandoPlanta = false;
let recorrido = null;
let controlador = null;
let solicitud = 0;
let ordenActual = null;

const seleccionados = new Map();
const resultados = { A: null, B: null };

const mapa = L.map('map').setView(CONFIG.centro, 15);

L.tileLayer(
    'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors'
    }
).addTo(mapa);

const capaProveedores = L.featureGroup().addTo(mapa);

function iconoProveedor(seleccionado) {
    return L.divIcon({
        className: seleccionado
            ? 'marcador-biogiro marcador-seleccionado'
            : 'marcador-biogiro',
        html: '<i class="bi bi-geo-alt-fill"></i>',
        iconSize: [34, 40],
        iconAnchor: [17, 40],
        popupAnchor: [0, -35]
    });
}

const iconoPlanta = L.divIcon({
    className: '',
    html: `
        <div style="
            width:48px;height:48px;border-radius:50%;
            background:#173c29;border:4px solid white;
            box-shadow:0 3px 12px #0005;
            display:flex;align-items:center;
            justify-content:center;color:white;font-size:23px">
            <i class="bi bi-building-gear"></i>
        </div>`,
    iconSize: [48, 48],
    iconAnchor: [24, 24],
    popupAnchor: [0, -24]
});

function numero(valor) {
    if (valor === null || valor === undefined || valor === '') {
        return null;
    }
    const n = Number(valor);
    return Number.isFinite(n) && n >= 0 ? n : null;
}

function volumen(p) {
    return numero(p.avu_estimado);
}

function coordenadaValida(p) {
    if (
        p.latitud === null || p.latitud === undefined ||
        p.longitud === null || p.longitud === undefined ||
        p.latitud === '' || p.longitud === ''
    ) return false;

    const lat = Number(p.latitud);
    const lng = Number(p.longitud);

    return Number.isFinite(lat) && Number.isFinite(lng) &&
        lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function texto(id, valor) {
    const el = $(id);
    if (el) el.textContent = String(valor);
}

function celda(fila, valor) {
    const td = document.createElement('td');
    td.textContent = String(valor ?? '');
    fila.appendChild(td);
    return td;
}

function mensajeRuta(mensaje) {
    texto('estado-recorrido', mensaje);
}

function coordenadasPlanta() {
    return planta
        ? [planta.latitud, planta.longitud]
        : null;
}

/* ==========================================
   PANELES DINÁMICOS
========================================== */

function crearPanelPlanta() {
    const panel = document.createElement('div');
    panel.id = 'panel-planta';
    panel.style.cssText = `
        padding:20px;margin-bottom:22px;
        border:1px solid #d7e7db;border-radius:14px;
        background:#f0f8f2;
    `;

    panel.innerHTML = `
        <div class="d-flex align-items-center gap-3 mb-3">
            <i class="bi bi-building-gear"
               style="font-size:28px;color:#2e7d32"></i>
            <div>
                <h3 class="h6 fw-bold mb-1">
                    Planta de producción BIOGIRO
                </h3>
                <small class="text-muted">
                    Origen y destino de ambos circuitos
                </small>
            </div>
        </div>

        <p class="small mb-2">
            <strong>Dirección hipotética:</strong>
            ${CONFIG.direccionPlanta}
        </p>

        <p id="estado-planta" class="small text-muted"
           role="status" aria-live="polite">
            Buscando ubicación...
        </p>

        <div class="d-flex flex-wrap gap-2">
            <button id="btn-ver-planta" type="button"
                class="btn btn-outline-success btn-sm" disabled>
                <i class="bi bi-geo-alt-fill"></i>
                Ver planta
            </button>
            <button id="btn-ajustar-planta" type="button"
                class="btn btn-outline-secondary btn-sm">
                <i class="bi bi-crosshair"></i>
                Ajustar ubicación
            </button>
        </div>

        <p class="small text-muted mt-3 mb-0">
            La geocodificación puede ser aproximada.
            Comprueba el punto en el mapa.
        </p>
    `;

    const seccion = $('rutas');
    const encabezado = seccion.querySelector('.section-heading');

    if (encabezado) {
        encabezado.insertAdjacentElement('afterend', panel);
    } else {
        seccion.prepend(panel);
    }

    $('btn-ver-planta').addEventListener('click', () => {
        if (!planta) return;
        $('map').scrollIntoView({ behavior: 'smooth' });
        setTimeout(() => {
            mapa.invalidateSize();
            mapa.setView(coordenadasPlanta(), 17);
            marcadorPlanta.openPopup();
        }, 250);
    });

    $('btn-ajustar-planta').addEventListener(
        'click',
        alternarAjustePlanta
    );
}

function crearPanelComparacion() {
    const panel = document.createElement('section');
    panel.id = 'panel-comparacion';
    panel.style.cssText = `
        background:white;border:1px solid #dce8e0;
        border-radius:16px;padding:22px;
        margin-top:24px;box-shadow:0 2px 12px #00000008;
    `;

    panel.innerHTML = `
        <div class="d-flex flex-wrap align-items-center
                    justify-content-between gap-3 mb-3">
            <div>
                <h3 class="h5 fw-bold mb-1">
                    <i class="bi bi-bar-chart-line me-2"></i>
                    Comparación de rutas
                </h3>
                <p class="small text-muted mb-0">
                    Volúmenes simulados y recorridos viales calculados
                </p>
            </div>
            <button id="btn-exportar-reporte"
                type="button" class="btn btn-success btn-sm">
                <i class="bi bi-file-earmark-spreadsheet"></i>
                Exportar reporte CSV
            </button>
        </div>

        <div class="table-responsive">
            <table class="table table-bordered
                          table-hover align-middle mb-2">
                <thead class="table-light">
                    <tr>
                        <th>Indicador</th>
                        <th>Ruta A</th>
                        <th>Ruta B</th>
                    </tr>
                </thead>
                <tbody id="tabla-comparacion"></tbody>
            </table>
        </div>

        <p id="conclusion-comparacion"
           class="small mb-2"></p>

        <p class="small text-muted mb-0">
            Las distancias y tiempos proceden de OSRM
            cuando se calcula cada circuito.
            No incluyen tráfico, carga ni descarga.
            La simulación no acredita recolecciones reales.
        </p>
    `;

    $('rutas').appendChild(panel);

    $('btn-exportar-reporte').addEventListener(
        'click',
        exportarReporte
    );

    actualizarComparacion();
}

/* ==========================================
   PLANTA
========================================== */

function establecerPlanta(latitud, longitud, origen) {
    const lat = Number(latitud);
    const lng = Number(longitud);

    if (
        !Number.isFinite(lat) || !Number.isFinite(lng) ||
        lat < -90 || lat > 90 || lng < -180 || lng > 180
    ) return;

    const cambio = !planta ||
        planta.latitud !== lat ||
        planta.longitud !== lng;

    planta = { latitud: lat, longitud: lng, origen };

    if (!marcadorPlanta) {
        marcadorPlanta = L.marker(
            [lat, lng],
            { icon: iconoPlanta, zIndexOffset: 1000 }
        ).addTo(mapa);
    } else {
        marcadorPlanta.setLatLng([lat, lng]);
    }

    const popup = document.createElement('div');
    const titulo = document.createElement('strong');
    titulo.textContent = 'PLANTA BIOGIRO';
    const direccion = document.createElement('p');
    direccion.textContent = CONFIG.direccionPlanta;
    const nota = document.createElement('small');
    nota.textContent = 'Ubicación hipotética.';
    popup.append(titulo, direccion, nota);

    marcadorPlanta.bindPopup(popup);
    $('btn-ver-planta').disabled = false;

    texto(
        'estado-planta',
        `Ubicación ${origen}: ${lat.toFixed(6)}, ${lng.toFixed(6)}`
    );

    if (cambio) {
        invalidarRecorrido();
        resultados.A = null;
        resultados.B = null;
        actualizarComparacion();
        actualizarPanelRuta();
        mensajeRuta(
            'La planta cambió de posición. ' +
            'Calcula nuevamente las rutas.'
        );
    }
}

async function buscarPlanta() {
    try {
        const params = new URLSearchParams({
            q: CONFIG.direccionPlanta,
            format: 'json',
            limit: '5',
            countrycodes: 'mx'
        });

        const respuesta = await fetch(
            `${CONFIG.nominatim}?${params}`
        );

        if (!respuesta.ok) throw new Error('Geocodificación fallida');

        const opciones = await respuesta.json();

        const punto = opciones.find(p => {
            const lat = Number(p.lat);
            const lng = Number(p.lon);
            return lat >= 20.10 && lat <= 20.15 &&
                   lng >= -98.77 && lng <= -98.70;
        });

        if (!punto) throw new Error('Sin coincidencia confiable');

        establecerPlanta(
            punto.lat,
            punto.lon,
            'aproximada por dirección'
        );

    } catch (error) {
        console.warn(error);
        texto(
            'estado-planta',
            'No se localizó la dirección automáticamente. ' +
            'Usa "Ajustar ubicación" y selecciona el punto en el mapa.'
        );
    }
}

function alternarAjustePlanta() {
    ajustandoPlanta = !ajustandoPlanta;

    const boton = $('btn-ajustar-planta');

    boton.classList.toggle('btn-warning', ajustandoPlanta);
    boton.classList.toggle(
        'btn-outline-secondary',
        !ajustandoPlanta
    );

    boton.textContent = ajustandoPlanta
        ? 'Cancelar ajuste'
        : 'Ajustar ubicación';

    if (ajustandoPlanta) {
        texto(
            'estado-planta',
            'Haz clic en el mapa sobre la ubicación de la planta.'
        );
        $('map').scrollIntoView({ behavior: 'smooth' });
    } else if (planta) {
        texto(
            'estado-planta',
            `Ubicación ${planta.origen}: ` +
            `${planta.latitud.toFixed(6)}, ` +
            `${planta.longitud.toFixed(6)}`
        );
    }
}

mapa.on('click', evento => {
    if (!ajustandoPlanta) return;

    establecerPlanta(
        evento.latlng.lat,
        evento.latlng.lng,
        'ajustada manualmente'
    );

    alternarAjustePlanta();
    marcadorPlanta.openPopup();
});

/* ==========================================
   MARCADORES Y TABLA
========================================== */

function mostrarMarcadores(datos, ajustar = true) {
    visibles = [...datos];
    capaProveedores.clearLayers();

    datos.forEach(p => {
        if (!coordenadaValida(p)) return;

        const seleccionado = seleccionados.has(
            String(p.id_denue)
        );

        const marcador = L.marker(
            [Number(p.latitud), Number(p.longitud)],
            { icon: iconoProveedor(seleccionado) }
        );

        const contenido = document.createElement('div');
        const nombre = document.createElement('strong');
        nombre.textContent = p.nombre || 'Sin nombre';
        contenido.appendChild(nombre);

        [
            p.direccion || 'Dirección no disponible',
            `AVU simulado: ${volumen(p) ?? 'Sin dato'} L`,
            `Ruta: ${p.ruta_simulada || 'Sin asignar'}`
        ].forEach(linea => {
            const parrafo = document.createElement('p');
            parrafo.textContent = linea;
            contenido.appendChild(parrafo);
        });

        marcador.bindPopup(contenido);
        capaProveedores.addLayer(marcador);
    });

    if (ajustar && capaProveedores.getLayers().length) {
        mapa.fitBounds(capaProveedores.getBounds(), {
            padding: [40, 40],
            maxZoom: 16
        });
    }
}

function mostrarTabla(datos) {
    const tbody = $('tabla-establecimientos');
    tbody.replaceChildren();

    if (!datos.length) {
        const fila = document.createElement('tr');
        const td = celda(fila, 'Sin resultados');
        td.colSpan = 6;
        tbody.appendChild(fila);
        return;
    }

    datos.forEach(p => {
        const fila = document.createElement('tr');

        const tdCheck = document.createElement('td');
        const check = document.createElement('input');

        check.type = 'checkbox';
        check.className = 'checkbox-ruta';
        check.checked = seleccionados.has(String(p.id_denue));

        check.setAttribute(
            'aria-label',
            `Seleccionar ${p.nombre || p.id_denue}`
        );

        check.addEventListener('change', () => {
            seleccionarProveedor(p, check.checked);
        });

        tdCheck.appendChild(check);
        fila.appendChild(tdCheck);

        celda(fila, p.nombre || 'Sin nombre');
        celda(fila, p.actividad || 'No especificada');
        celda(
            fila,
            volumen(p) === null
                ? 'Pendiente'
                : `${volumen(p)} L`
        );

        const tdPrioridad = document.createElement('td');
        const badge = document.createElement('span');
        const prioridad = p.prioridad || 'Sin evaluar';

        badge.className =
            `priority-badge ${prioridad.toLowerCase()}`;
        badge.textContent = prioridad;

        tdPrioridad.appendChild(badge);
        fila.appendChild(tdPrioridad);

        celda(fila, p.estado || 'Prospecto');

        tbody.appendChild(fila);
    });
}

function aplicarFiltros() {
    const busqueda = $('buscar-establecimiento')
        .value.toLocaleLowerCase('es').trim();

    const prioridad = $('filtro-prioridad').value;

    const filtrados = establecimientos.filter(p => {
        const cadena = [
            p.nombre, p.actividad, p.id_denue
        ].join(' ').toLocaleLowerCase('es');

        return cadena.includes(busqueda) &&
            (
                prioridad === 'todos' ||
                p.prioridad === prioridad
            );
    });

    mostrarTabla(filtrados);
    mostrarMarcadores(filtrados);

    texto(
        'contador-resultados',
        `${filtrados.length} de ${establecimientos.length} resultados`
    );
}

/* ==========================================
   SELECCIÓN Y CAPACIDAD
========================================== */

function invalidarRecorrido() {
    solicitud++;

    if (controlador) {
        controlador.abort();
        controlador = null;
    }

    if (recorrido) {
        mapa.removeLayer(recorrido);
        recorrido = null;
    }

    ordenActual = null;

    texto('ruta-distancia', 'Sin calcular');
    texto('ruta-tiempo', 'Sin calcular');

    $('btn-calcular-recorrido').disabled = false;
}

function activarEscenario(letra) {
    escenario = letra;

    ['A', 'B'].forEach(clave => {
        const boton = $(`btn-ruta-${clave.toLowerCase()}`);
        const activo = clave === letra;

        boton.classList.toggle('activa', activo);
        boton.setAttribute('aria-pressed', String(activo));
    });
}

function seleccionarProveedor(p, activo) {
    invalidarRecorrido();
    activarEscenario(null);

    const id = String(p.id_denue);

    if (activo) seleccionados.set(id, p);
    else seleccionados.delete(id);

    actualizarPanelRuta();
    mostrarTabla(visibles);
    mostrarMarcadores(visibles, false);

    mensajeRuta(
        'Selección modificada. Calcula el circuito desde la planta.'
    );
}

function totales(datos) {
    return {
        litros: datos.reduce(
            (suma, p) => suma + (volumen(p) ?? 0),
            0
        ),
        pendientes: datos.filter(
            p => volumen(p) === null
        ).length
    };
}

function agregarElementoRuta(lista, nombre, dato, especial = false) {
    const li = document.createElement('li');
    const titulo = document.createElement('span');
    const detalle = document.createElement('span');

    titulo.className = 'stop-name';
    detalle.className = 'stop-volume';

    titulo.textContent = nombre;
    detalle.textContent = dato;

    if (especial) {
        li.style.background = '#e7f5e9';
        li.style.borderColor = '#b6d9bd';
    }

    li.append(titulo, detalle);
    lista.appendChild(li);
}

function actualizarPanelRuta() {
    const datos = [...seleccionados.values()];
    const { litros, pendientes } = totales(datos);
    const porcentaje = litros / CONFIG.capacidad * 100;

    texto('ruta-total-paradas', datos.length);
    texto('ruta-total-litros', `${litros.toFixed(1)} L`);
    texto('ruta-capacidad', `${CONFIG.capacidad} L`);
    texto('ruta-porcentaje', `${porcentaje.toFixed(1)}%`);

    const progreso = $('ruta-progreso');
    progreso.style.width = `${Math.min(porcentaje, 100)}%`;
    progreso.classList.toggle('bg-danger', porcentaje > 100);
    progreso.setAttribute(
        'aria-valuenow',
        String(Math.min(porcentaje, 100))
    );

    const lista = $('lista-ruta');
    lista.replaceChildren();

    if (!datos.length) {
        agregarElementoRuta(
            lista,
            'Selecciona establecimientos o carga una ruta.',
            ''
        );
        return;
    }

    if (planta) {
        agregarElementoRuta(
            lista,
            'Salida: Planta BIOGIRO',
            'Planta',
            true
        );
    }

    (ordenActual || datos).forEach(p => {
        agregarElementoRuta(
            lista,
            p.nombre || 'Sin nombre',
            volumen(p) === null
                ? 'Pendiente'
                : `${volumen(p)} L`
        );
    });

    if (planta) {
        agregarElementoRuta(
            lista,
            'Regreso: Planta BIOGIRO',
            'Planta',
            true
        );
    }

    if (porcentaje > 100 || pendientes) {
        agregarElementoRuta(
            lista,
            porcentaje > 100
                ? 'Capacidad del vehículo superada'
                : 'Existen volúmenes sin evaluar',
            'Aviso'
        );
    }
}

function mostrarSeleccionEnMapa() {
    const puntos = [...seleccionados.values()]
        .filter(coordenadaValida)
        .map(p => [Number(p.latitud), Number(p.longitud)]);

    if (planta) puntos.push(coordenadasPlanta());

    if (!puntos.length) {
        alert('Selecciona establecimientos.');
        return;
    }

    $('map').scrollIntoView({ behavior: 'smooth' });

    setTimeout(() => {
        mapa.invalidateSize();

        if (puntos.length === 1) {
            mapa.setView(puntos[0], 16);
        } else {
            mapa.fitBounds(L.latLngBounds(puntos), {
                padding: [50, 50],
                maxZoom: 16
            });
        }
    }, 250);
}

function cargarEscenario(letra) {
    const datos = establecimientos.filter(
        p => p.ruta_simulada === letra
    );

    if (!datos.length) {
        alert(`La Ruta ${letra} no contiene establecimientos.`);
        return;
    }

    invalidarRecorrido();
    seleccionados.clear();

    datos.forEach(p => {
        seleccionados.set(String(p.id_denue), p);
    });

    activarEscenario(letra);

    $('buscar-establecimiento').value = '';
    $('filtro-prioridad').value = 'todos';

    aplicarFiltros();
    actualizarPanelRuta();
    mostrarSeleccionEnMapa();

    mensajeRuta(
        `Ruta ${letra} cargada. Calcula el recorrido ` +
        'para actualizar su distancia y tiempo.'
    );
}

/* ==========================================
   ORDEN DE PARADAS Y CIRCUITO VIAL
========================================== */

function distanciaGeografica(a, b) {
    const rad = grados => grados * Math.PI / 180;

    const lat1 = rad(Number(a.latitud));
    const lat2 = rad(Number(b.latitud));
    const dLat = lat2 - lat1;
    const dLng = rad(
        Number(b.longitud) - Number(a.longitud)
    );

    const h =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1) * Math.cos(lat2) *
        Math.sin(dLng / 2) ** 2;

    return 12742000 * Math.asin(
        Math.min(1, Math.sqrt(h))
    );
}

function ordenarParadas(datos) {
    const pendientes = [...datos];
    const orden = [];
    let actual = planta;

    while (pendientes.length) {
        let indice = 0;
        let distancia = Infinity;

        pendientes.forEach((p, i) => {
            const d = distanciaGeografica(actual, p);
            if (d < distancia) {
                distancia = d;
                indice = i;
            }
        });

        const siguiente = pendientes.splice(indice, 1)[0];
        orden.push(siguiente);
        actual = siguiente;
    }

    return orden;
}

async function calcularRecorrido() {
    if (!planta) {
        alert('Ubica primero la planta en el mapa.');
        return;
    }

    const datos = [...seleccionados.values()];

    if (!datos.length) {
        alert('Selecciona al menos un establecimiento.');
        return;
    }

    if (!datos.every(coordenadaValida)) {
        alert('Hay establecimientos sin coordenadas válidas.');
        return;
    }

    const { litros, pendientes } = totales(datos);

    if (litros > CONFIG.capacidad) {
        alert('El volumen supera los 300 L del vehículo.');
        return;
    }

    if (pendientes) {
        alert('Hay establecimientos sin volumen estimado.');
        return;
    }

    invalidarRecorrido();

    const idSolicitud = solicitud;
    const controller = new AbortController();
    controlador = controller;

    const orden = ordenarParadas(datos);

    const puntos = [planta, ...orden, planta];

    const coordenadas = puntos.map(p =>
        `${Number(p.longitud)},${Number(p.latitud)}`
    ).join(';');

    const url = CONFIG.osrm + coordenadas +
        '?overview=full&geometries=geojson&steps=false';

    const boton = $('btn-calcular-recorrido');
    boton.disabled = true;

    mensajeRuta(
        'Calculando circuito completo desde la planta...'
    );

    try {
        const respuesta = await fetch(
            url,
            { signal: controller.signal }
        );

        if (!respuesta.ok) {
            throw new Error(`HTTP ${respuesta.status}`);
        }

        const datosOSRM = await respuesta.json();

        if (idSolicitud !== solicitud) return;

        if (
            datosOSRM.code !== 'Ok' ||
            !datosOSRM.routes?.length
        ) {
            throw new Error(
                datosOSRM.message || 'Ruta no disponible'
            );
        }

        const ruta = datosOSRM.routes[0];

        const geometria = ruta.geometry?.coordinates;

        if (!geometria?.length) {
            throw new Error('Sin geometría vial');
        }

        const linea = geometria.map(
            ([lng, lat]) => [lat, lng]
        );

        recorrido = L.polyline(linea, {
            color: '#2563eb',
            weight: 6,
            opacity: 0.9
        }).addTo(mapa);

        ordenActual = orden;
        actualizarPanelRuta();

        const km = ruta.distance / 1000;
        const minutos = ruta.duration / 60;

        texto('ruta-distancia', `${km.toFixed(2)} km`);
        texto('ruta-tiempo', `${Math.round(minutos)} min`);

        if (escenario === 'A' || escenario === 'B') {
            resultados[escenario] = {
                letra: escenario,
                paradas: orden.length,
                litros,
                kilometros: km,
                minutos,
                orden: orden.map(p => ({
                    id: p.id_denue,
                    nombre: p.nombre,
                    litros: volumen(p)
                })),
                planta: { ...planta },
                fecha: new Date().toLocaleString('es-MX')
            };

            actualizarComparacion();
        }

        mensajeRuta(
            `Circuito completo calculado: ` +
            `${km.toFixed(2)} km y ` +
            `${Math.round(minutos)} min de conducción. ` +
            'No incluye tráfico ni carga y descarga.'
        );

        $('map').scrollIntoView({ behavior: 'smooth' });

        setTimeout(() => {
            mapa.invalidateSize();
            if (recorrido) {
                mapa.fitBounds(recorrido.getBounds(), {
                    padding: [45, 45]
                });
            }
        }, 250);

    } catch (error) {
        if (
            idSolicitud !== solicitud ||
            error.name === 'AbortError'
        ) return;

        console.error(error);

        mensajeRuta(
            'No se pudo calcular el circuito. ' +
            'Revisa tu conexión o intenta nuevamente.'
        );

    } finally {
        if (idSolicitud === solicitud) {
            controlador = null;
            boton.disabled = false;
        }
    }
}

/* ==========================================
   COMPARACIÓN DE RUTAS
========================================== */

function datosEscenario(letra) {
    const datos = establecimientos.filter(
        p => p.ruta_simulada === letra
    );

    const { litros } = totales(datos);

    return {
        paradas: datos.length,
        litros,
        porcentaje: litros / CONFIG.capacidad * 100
    };
}

function agregarFilaComparacion(
    cuerpo, etiqueta, valorA, valorB
) {
    const fila = document.createElement('tr');

    const th = document.createElement('th');
    th.scope = 'row';
    th.textContent = etiqueta;
    fila.appendChild(th);

    celda(fila, valorA);
    celda(fila, valorB);

    cuerpo.appendChild(fila);
}

function actualizarComparacion() {
    const cuerpo = $('tabla-comparacion');
    if (!cuerpo) return;

    cuerpo.replaceChildren();

    const a = datosEscenario('A');
    const b = datosEscenario('B');
    const ra = resultados.A;
    const rb = resultados.B;

    agregarFilaComparacion(
        cuerpo,
        'Establecimientos',
        a.paradas,
        b.paradas
    );

    agregarFilaComparacion(
        cuerpo,
        'AVU estimado',
        `${a.litros} L`,
        `${b.litros} L`
    );

    agregarFilaComparacion(
        cuerpo,
        'Capacidad del vehículo',
        `${CONFIG.capacidad} L`,
        `${CONFIG.capacidad} L`
    );

    agregarFilaComparacion(
        cuerpo,
        'Aprovechamiento',
        `${a.porcentaje.toFixed(1)}%`,
        `${b.porcentaje.toFixed(1)}%`
    );

    agregarFilaComparacion(
        cuerpo,
        'Distancia del circuito',
        ra ? `${ra.kilometros.toFixed(2)} km` : 'Pendiente',
        rb ? `${rb.kilometros.toFixed(2)} km` : 'Pendiente'
    );

    agregarFilaComparacion(
        cuerpo,
        'Tiempo de conducción',
        ra ? `${Math.round(ra.minutos)} min` : 'Pendiente',
        rb ? `${Math.round(rb.minutos)} min` : 'Pendiente'
    );

    const eficiencia = r =>
        r && r.kilometros > 0
            ? r.litros / r.kilometros
            : null;

    const ea = eficiencia(ra);
    const eb = eficiencia(rb);

    agregarFilaComparacion(
        cuerpo,
        'Litros estimados por km',
        ea === null ? 'Pendiente' : `${ea.toFixed(2)} L/km`,
        eb === null ? 'Pendiente' : `${eb.toFixed(2)} L/km`
    );

    let conclusion =
        'Calcula ambos circuitos para comparar ' +
        'distancia, tiempo y litros por kilómetro.';

    if (ra && rb && ea !== null && eb !== null) {
        const diferencia = Math.abs(ea - eb);

        if (diferencia < 0.001) {
            conclusion =
                'Ambas rutas presentan una eficiencia ' +
                'similar en litros estimados por kilómetro.';
        } else {
            const mejor = ea > eb ? 'A' : 'B';
            conclusion =
                `La Ruta ${mejor} presenta mayor cantidad ` +
                'estimada de AVU por kilómetro recorrido. ' +
                'Esto no implica necesariamente menor costo ' +
                'operativo total.';
        }
    }

    texto('conclusion-comparacion', conclusion);
}

/* ==========================================
   EXPORTACIÓN CSV
========================================== */

function escaparCSV(valor) {
    const textoValor = String(valor ?? '');

    // Escapar fórmulas al abrir en Excel.
    const seguro = /^[\s]*[=+\-@]/.test(textoValor)
        ? "'" + textoValor
        : textoValor;

    return '"' + seguro.replaceAll('"', '""') + '"';
}

function descargarCSV(nombre, filas) {
    const contenido = '\uFEFF' +
        filas.map(fila =>
            fila.map(escaparCSV).join(';')
        ).join('\r\n');

    const blob = new Blob(
        [contenido],
        { type: 'text/csv;charset=utf-8;' }
    );

    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');

    enlace.href = url;
    enlace.download = nombre;

    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportarReporte() {
    if (!establecimientos.length) {
        alert('Todavía no se han cargado los datos.');
        return;
    }

    const filas = [
        ['BIOGIRO - Reporte de simulación de recolección'],
        ['Fecha de exportación', new Date().toLocaleString('es-MX')],
        ['Tipo', 'Simulación académica, no recolección real'],
        ['Planta hipotética', CONFIG.direccionPlanta],
        ['Capacidad del vehículo (L)', CONFIG.capacidad],
        [],
        [
            'Indicador',
            'Ruta A',
            'Ruta B'
        ]
    ];

    const a = datosEscenario('A');
    const b = datosEscenario('B');
    const ra = resultados.A;
    const rb = resultados.B;

    filas.push(
        ['Establecimientos', a.paradas, b.paradas],
        ['AVU estimado (L)', a.litros, b.litros],
        [
            'Aprovechamiento (%)',
            a.porcentaje.toFixed(1),
            b.porcentaje.toFixed(1)
        ],
        [
            'Distancia (km)',
            ra ? ra.kilometros.toFixed(2) : 'Pendiente',
            rb ? rb.kilometros.toFixed(2) : 'Pendiente'
        ],
        [
            'Tiempo conducción (min)',
            ra ? ra.minutos.toFixed(1) : 'Pendiente',
            rb ? rb.minutos.toFixed(1) : 'Pendiente'
        ],
        [
            'Litros por km',
            ra && ra.kilometros > 0
                ? (ra.litros / ra.kilometros).toFixed(2)
                : 'Pendiente',
            rb && rb.kilometros > 0
                ? (rb.litros / rb.kilometros).toFixed(2)
                : 'Pendiente'
        ],
        [],
        [
            'Ruta',
            'Orden',
            'ID DENUE',
            'Establecimiento',
            'AVU estimado (L)',
            'Estado del cálculo'
        ]
    );

    ['A', 'B'].forEach(letra => {
        const resultado = resultados[letra];

        const lista = resultado
            ? resultado.orden
            : establecimientos
                .filter(p => p.ruta_simulada === letra)
                .map(p => ({
                    id: p.id_denue,
                    nombre: p.nombre,
                    litros: volumen(p)
                }));

        filas.push([
            letra,
            0,
            '',
            'Salida: Planta BIOGIRO',
            '',
            resultado ? 'Calculado' : 'Pendiente'
        ]);

        lista.forEach((p, indice) => {
            filas.push([
                letra,
                indice + 1,
                p.id,
                p.nombre,
                p.litros ?? 'Sin evaluar',
                resultado ? 'Calculado' : 'Sin ordenar'
            ]);
        });

        filas.push([
            letra,
            lista.length + 1,
            '',
            'Regreso: Planta BIOGIRO',
            '',
            resultado ? 'Calculado' : 'Pendiente'
        ]);
    });

    filas.push(
        [],
        [
            'Nota',
            'Los volúmenes son simulados. ' +
            'Las métricas viales dependen del servicio OSRM.'
        ],
        [
            'Nota',
            'No se incluyen tráfico, carga, descarga ' +
            'ni costos operativos.'
        ]
    );

    const fecha = new Date()
        .toISOString()
        .slice(0, 10);

    descargarCSV(
        `BIOGIRO_Reporte_Rutas_${fecha}.csv`,
        filas
    );
}

/* ==========================================
   CARGA DE DATOS
========================================== */

async function cargarEstablecimientos() {
    try {
        const respuesta = await fetch(
            'data/establecimientos.json',
            { cache: 'no-store' }
        );

        if (!respuesta.ok) {
            throw new Error(`HTTP ${respuesta.status}`);
        }

        const datos = await respuesta.json();

        if (!Array.isArray(datos)) {
            throw new Error('El JSON no es un arreglo');
        }

        establecimientos = datos;

        texto('total-establecimientos', datos.length);

        const litros = totales(datos).litros;
        texto('total-avu', `${litros} L`);

        const escenarios = new Set(
            datos.map(p => p.ruta_simulada).filter(Boolean)
        );

        texto('total-escenarios', escenarios.size);

        ['A', 'B'].forEach(letra => {
            const grupo = datos.filter(
                p => p.ruta_simulada === letra
            );

            texto(
                `resumen-ruta-${letra.toLowerCase()}`,
                `${grupo.length} paradas · ` +
                `${totales(grupo).litros} L simulados`
            );
        });

        aplicarFiltros();
        actualizarPanelRuta();
        actualizarComparacion();

        console.log(
            'BIOGIRO v2.2:',
            datos.length,
            'establecimientos cargados'
        );

    } catch (error) {
        console.error('Error de carga:', error);

        mensajeRuta(
            'No se pudo cargar establecimientos.json. ' +
            'Verifica Live Server y la consola.'
        );
    }
}

/* ==========================================
   EVENTOS E INICIALIZACIÓN
========================================== */

$('buscar-establecimiento').addEventListener(
    'input', aplicarFiltros
);

$('filtro-prioridad').addEventListener(
    'change', aplicarFiltros
);

$('btn-ruta-a').addEventListener(
    'click', () => cargarEscenario('A')
);

$('btn-ruta-b').addEventListener(
    'click', () => cargarEscenario('B')
);

$('btn-ver-seleccion').addEventListener(
    'click', mostrarSeleccionEnMapa
);

$('btn-calcular-recorrido').addEventListener(
    'click', calcularRecorrido
);

$('btn-limpiar-ruta').addEventListener('click', () => {
    invalidarRecorrido();
    seleccionados.clear();
    activarEscenario(null);

    mostrarTabla(visibles);
    mostrarMarcadores(visibles, false);
    actualizarPanelRuta();

    mensajeRuta('Selección limpiada.');
});

crearPanelPlanta();
crearPanelComparacion();
cargarEstablecimientos();
buscarPlanta();
