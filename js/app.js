
'use strict';

/*
 BIOGIRO v2.3
 Simulador académico de recolección de AVU.
 Rutas A y B, planta, comparación, CSV y analítica.
*/

const CONFIG = {
    centro: [20.126, -98.734],
    capacidad: 300,
    direccion: 'Calle Mariano Abasolo 609, Centro, Pachuca de Soto, Hidalgo, México',
    geocoder: 'https://nominatim.openstreetmap.org/search',
    router: 'https://router.project-osrm.org/route/v1/driving/'
};

const $ = id => document.getElementById(id);
const seleccion = new Map();
const resultados = { A: null, B: null };

let datos = [];
let visibles = [];
let escenario = null;
let planta = null;
let marcadorPlanta = null;
let ajustarPlanta = false;
let lineaRuta = null;
let controlador = null;
let solicitud = 0;
let ordenActual = null;

const mapa = L.map('map').setView(CONFIG.centro, 15);

L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(mapa);

const capaProveedores = L.featureGroup().addTo(mapa);

function iconoProveedor(activo) {
    return L.divIcon({
        className: activo
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
    html: `<div style="
        width:48px;height:48px;border-radius:50%;
        background:#173c29;color:white;
        border:4px solid white;box-shadow:0 3px 12px #0005;
        display:flex;align-items:center;justify-content:center;
        font-size:23px">
        <i class="bi bi-building-gear"></i></div>`,
    iconSize: [48, 48],
    iconAnchor: [24, 24],
    popupAnchor: [0, -24]
});

function escribir(id, valor) {
    if ($(id)) $(id).textContent = String(valor);
}

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
        Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

function totalizar(lista) {
    return {
        litros: lista.reduce((s, p) => s + (volumen(p) ?? 0), 0),
        pendientes: lista.filter(p => volumen(p) === null).length
    };
}

function grupo(letra) {
    return datos.filter(p => p.ruta_simulada === letra);
}

function crearCelda(tr, valor, encabezado = false) {
    const celda = document.createElement(encabezado ? 'th' : 'td');
    celda.textContent = String(valor ?? '');
    tr.appendChild(celda);
    return celda;
}

function crearFila(tbody, valores) {
    const tr = document.createElement('tr');
    valores.forEach((v, i) => crearCelda(tr, v, i === 0));
    tbody.appendChild(tr);
}

function mensaje(texto) {
    escribir('estado-recorrido', texto);
}

/* PLANTA */

function crearPanelPlanta() {
    const panel = document.createElement('div');
    panel.id = 'panel-planta';
    panel.style.cssText = `
        background:#f0f8f2;border:1px solid #d7e7db;
        border-radius:14px;padding:20px;margin-bottom:22px`;

    panel.innerHTML = `
        <h3 class="h6 fw-bold">
            <i class="bi bi-building-gear me-2"></i>
            Planta de producción BIOGIRO
        </h3>
        <p class="small mb-2">
            <strong>Ubicación hipotética:</strong> ${CONFIG.direccion}
        </p>
        <p id="estado-planta" class="small text-muted"
           role="status">Buscando ubicación...</p>
        <div class="d-flex flex-wrap gap-2">
            <button id="btn-ver-planta" type="button"
                class="btn btn-outline-success btn-sm" disabled>
                Ver planta
            </button>
            <button id="btn-ajustar-planta" type="button"
                class="btn btn-outline-secondary btn-sm">
                Ajustar ubicación
            </button>
        </div>
        <p class="small text-muted mt-3 mb-0">
            Comprueba el punto sobre el mapa.
            La dirección puede geocodificarse de forma aproximada.
        </p>`;

    const seccion = $('rutas');
    const encabezado = seccion.querySelector('.section-heading');

    if (encabezado) encabezado.after(panel);
    else seccion.prepend(panel);

    $('btn-ver-planta').addEventListener('click', () => {
        if (!planta) return;
        $('map').scrollIntoView({ behavior: 'smooth' });
        setTimeout(() => {
            mapa.invalidateSize();
            mapa.setView([planta.latitud, planta.longitud], 17);
            marcadorPlanta.openPopup();
        }, 250);
    });

    $('btn-ajustar-planta').addEventListener('click', () => {
        ajustarPlanta = !ajustarPlanta;
        const boton = $('btn-ajustar-planta');
        boton.textContent = ajustarPlanta
            ? 'Cancelar ajuste'
            : 'Ajustar ubicación';
        boton.classList.toggle('btn-warning', ajustarPlanta);
        boton.classList.toggle(
            'btn-outline-secondary',
            !ajustarPlanta
        );

        if (ajustarPlanta) {
            escribir(
                'estado-planta',
                'Haz clic en el mapa para colocar la planta.'
            );
            $('map').scrollIntoView({ behavior: 'smooth' });
        }
    });
}

function establecerPlanta(latitud, longitud, origen) {
    const lat = Number(latitud);
    const lng = Number(longitud);

    if (
        !Number.isFinite(lat) || !Number.isFinite(lng) ||
        Math.abs(lat) > 90 || Math.abs(lng) > 180
    ) return;

    const cambio = !planta ||
        planta.latitud !== lat || planta.longitud !== lng;

    planta = { latitud: lat, longitud: lng, origen };

    if (!marcadorPlanta) {
        marcadorPlanta = L.marker([lat, lng], {
            icon: iconoPlanta,
            zIndexOffset: 1000
        }).addTo(mapa);
    } else {
        marcadorPlanta.setLatLng([lat, lng]);
    }

    const popup = document.createElement('div');
    const nombre = document.createElement('strong');
    nombre.textContent = 'PLANTA BIOGIRO';
    const direccion = document.createElement('p');
    direccion.textContent = CONFIG.direccion;
    popup.append(nombre, direccion);
    marcadorPlanta.bindPopup(popup);

    $('btn-ver-planta').disabled = false;

    escribir(
        'estado-planta',
        `${origen}: ${lat.toFixed(6)}, ${lng.toFixed(6)}`
    );

    if (cambio) {
        invalidarRecorrido();
        resultados.A = null;
        resultados.B = null;
        actualizarPanelRuta();
        actualizarComparacion();
        actualizarAnalitica();
    }
}

async function localizarPlanta() {
    try {
        const params = new URLSearchParams({
            q: CONFIG.direccion,
            format: 'json',
            limit: '5',
            countrycodes: 'mx'
        });

        const respuesta = await fetch(`${CONFIG.geocoder}?${params}`);
        if (!respuesta.ok) throw new Error('Geocodificación no disponible');

        const opciones = await respuesta.json();
        const punto = opciones.find(p =>
            Number(p.lat) >= 20.10 &&
            Number(p.lat) <= 20.15 &&
            Number(p.lon) >= -98.77 &&
            Number(p.lon) <= -98.70
        );

        if (!punto) throw new Error('Sin coincidencia confiable');

        establecerPlanta(
            punto.lat,
            punto.lon,
            'Ubicación aproximada'
        );
    } catch (error) {
        console.warn(error);
        escribir(
            'estado-planta',
            'No se encontró la dirección. Usa Ajustar ubicación.'
        );
    }
}

mapa.on('click', evento => {
    if (!ajustarPlanta) return;

    establecerPlanta(
        evento.latlng.lat,
        evento.latlng.lng,
        'Ubicación manual'
    );

    $('btn-ajustar-planta').click();
    marcadorPlanta.openPopup();
});

/* DIRECTORIO Y MAPA */

function mostrarMarcadores(lista, ajustar = true) {
    visibles = [...lista];
    capaProveedores.clearLayers();

    lista.forEach(p => {
        if (!coordenadaValida(p)) return;

        const activo = seleccion.has(String(p.id_denue));
        const marcador = L.marker(
            [Number(p.latitud), Number(p.longitud)],
            { icon: iconoProveedor(activo) }
        );

        const contenido = document.createElement('div');
        const titulo = document.createElement('strong');
        titulo.textContent = p.nombre || 'Sin nombre';
        contenido.appendChild(titulo);

        [
            p.direccion || 'Sin dirección',
            `AVU estimado: ${volumen(p) ?? 'Pendiente'} L`,
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

function mostrarTabla(lista) {
    const tbody = $('tabla-establecimientos');
    tbody.replaceChildren();

    if (!lista.length) {
        const tr = document.createElement('tr');
        const td = crearCelda(tr, 'No hay resultados');
        td.colSpan = 6;
        tbody.appendChild(tr);
        return;
    }

    lista.forEach(p => {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        const check = document.createElement('input');

        check.type = 'checkbox';
        check.className = 'checkbox-ruta';
        check.checked = seleccion.has(String(p.id_denue));
        check.setAttribute(
            'aria-label',
            `Seleccionar ${p.nombre || p.id_denue}`
        );
        check.addEventListener('change', () =>
            seleccionarProveedor(p, check.checked)
        );

        td.appendChild(check);
        tr.appendChild(td);

        crearCelda(tr, p.nombre || 'Sin nombre');
        crearCelda(tr, p.actividad || 'Sin actividad');
        crearCelda(
            tr,
            volumen(p) === null ? 'Pendiente' : `${volumen(p)} L`
        );

        const tdPrioridad = document.createElement('td');
        const badge = document.createElement('span');
        const prioridad = p.prioridad || 'Sin evaluar';
        badge.className = `priority-badge ${prioridad.toLowerCase()}`;
        badge.textContent = prioridad;
        tdPrioridad.appendChild(badge);
        tr.appendChild(tdPrioridad);

        crearCelda(tr, p.estado || 'Prospecto');
        tbody.appendChild(tr);
    });
}

function aplicarFiltros() {
    const q = $('buscar-establecimiento')
        .value.toLocaleLowerCase('es').trim();
    const prioridad = $('filtro-prioridad').value;

    const lista = datos.filter(p => {
        const cadena = [
            p.nombre, p.actividad, p.id_denue
        ].join(' ').toLocaleLowerCase('es');

        return cadena.includes(q) &&
            (prioridad === 'todos' || p.prioridad === prioridad);
    });

    mostrarTabla(lista);
    mostrarMarcadores(lista);
    escribir(
        'contador-resultados',
        `${lista.length} de ${datos.length} resultados`
    );
}

/* SELECCIÓN Y RUTAS */

function invalidarRecorrido() {
    solicitud++;

    if (controlador) {
        controlador.abort();
        controlador = null;
    }

    if (lineaRuta) {
        mapa.removeLayer(lineaRuta);
        lineaRuta = null;
    }

    ordenActual = null;
    escribir('ruta-distancia', 'Sin calcular');
    escribir('ruta-tiempo', 'Sin calcular');
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

    if (activo) seleccion.set(String(p.id_denue), p);
    else seleccion.delete(String(p.id_denue));

    mostrarTabla(visibles);
    mostrarMarcadores(visibles, false);
    actualizarPanelRuta();

    mensaje('Selección modificada. Calcula el circuito nuevamente.');
}

function agregarParada(lista, nombre, detalle, especial = false) {
    const li = document.createElement('li');
    const span1 = document.createElement('span');
    const span2 = document.createElement('span');

    span1.className = 'stop-name';
    span2.className = 'stop-volume';
    span1.textContent = nombre;
    span2.textContent = detalle;

    if (especial) {
        li.style.background = '#e7f5e9';
        li.style.borderColor = '#b6d9bd';
    }

    li.append(span1, span2);
    lista.appendChild(li);
}

function actualizarPanelRuta() {
    const lista = [...seleccion.values()];
    const { litros, pendientes } = totalizar(lista);
    const porcentaje = litros / CONFIG.capacidad * 100;

    escribir('ruta-total-paradas', lista.length);
    escribir('ruta-total-litros', `${litros.toFixed(1)} L`);
    escribir('ruta-capacidad', `${CONFIG.capacidad} L`);
    escribir('ruta-porcentaje', `${porcentaje.toFixed(1)}%`);

    const progreso = $('ruta-progreso');
    progreso.style.width = `${Math.min(porcentaje, 100)}%`;
    progreso.setAttribute(
        'aria-valuenow',
        String(Math.min(porcentaje, 100))
    );
    progreso.classList.toggle('bg-danger', porcentaje > 100);

    const ul = $('lista-ruta');
    ul.replaceChildren();

    if (!lista.length) {
        agregarParada(ul, 'Selecciona una ruta o establecimientos', '');
        return;
    }

    if (planta) {
        agregarParada(ul, 'Salida: Planta BIOGIRO', 'Planta', true);
    }

    (ordenActual || lista).forEach(p =>
        agregarParada(
            ul,
            p.nombre || 'Sin nombre',
            volumen(p) === null ? 'Pendiente' : `${volumen(p)} L`
        )
    );

    if (planta) {
        agregarParada(ul, 'Regreso: Planta BIOGIRO', 'Planta', true);
    }

    if (porcentaje > 100 || pendientes) {
        agregarParada(
            ul,
            porcentaje > 100
                ? 'Capacidad del vehículo superada'
                : 'Hay volúmenes sin evaluar',
            'Aviso'
        );
    }
}

function mostrarSeleccionEnMapa() {
    const puntos = [...seleccion.values()]
        .filter(coordenadaValida)
        .map(p => [Number(p.latitud), Number(p.longitud)]);

    if (planta) puntos.push([planta.latitud, planta.longitud]);

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
    const lista = grupo(letra);

    if (!lista.length) {
        alert(`La Ruta ${letra} no tiene establecimientos.`);
        return;
    }

    invalidarRecorrido();
    seleccion.clear();

    lista.forEach(p => seleccion.set(String(p.id_denue), p));
    activarEscenario(letra);

    $('buscar-establecimiento').value = '';
    $('filtro-prioridad').value = 'todos';

    aplicarFiltros();
    actualizarPanelRuta();
    mostrarSeleccionEnMapa();

    mensaje(`Ruta ${letra} cargada. Calcula el circuito vial.`);
}

function distanciaGeografica(a, b) {
    const rad = grados => grados * Math.PI / 180;
    const lat1 = rad(Number(a.latitud));
    const lat2 = rad(Number(b.latitud));
    const dLat = lat2 - lat1;
    const dLng = rad(Number(b.longitud) - Number(a.longitud));

    const h = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1) * Math.cos(lat2) *
        Math.sin(dLng / 2) ** 2;

    return 12742000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function ordenarParadas(lista) {
    const pendientes = [...lista];
    const orden = [];
    let actual = planta;

    while (pendientes.length) {
        let indice = 0;
        let mejor = Infinity;

        pendientes.forEach((p, i) => {
            const d = distanciaGeografica(actual, p);
            if (d < mejor) {
                mejor = d;
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
        alert('Ubica primero la planta.');
        return;
    }

    const lista = [...seleccion.values()];

    if (!lista.length) {
        alert('Selecciona al menos un establecimiento.');
        return;
    }

    if (!lista.every(coordenadaValida)) {
        alert('Hay establecimientos sin coordenadas válidas.');
        return;
    }

    const { litros, pendientes } = totalizar(lista);

    if (litros > CONFIG.capacidad) {
        alert('Se supera la capacidad de 300 L.');
        return;
    }

    if (pendientes) {
        alert('Existen establecimientos sin volumen estimado.');
        return;
    }

    invalidarRecorrido();

    const id = solicitud;
    const controller = new AbortController();
    controlador = controller;

    const orden = ordenarParadas(lista);
    const puntos = [planta, ...orden, planta];

    const coordenadas = puntos.map(p =>
        `${Number(p.longitud)},${Number(p.latitud)}`
    ).join(';');

    const url = CONFIG.router + coordenadas +
        '?overview=full&geometries=geojson&steps=false';

    $('btn-calcular-recorrido').disabled = true;
    mensaje('Calculando recorrido de ida y regreso a la planta...');

    try {
        const respuesta = await fetch(url, {
            signal: controller.signal
        });

        if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);

        const respuestaOSRM = await respuesta.json();
        if (id !== solicitud) return;

        if (
            respuestaOSRM.code !== 'Ok' ||
            !respuestaOSRM.routes?.length
        ) {
            throw new Error('El servicio no encontró un recorrido.');
        }

        const ruta = respuestaOSRM.routes[0];
        const geometria = ruta.geometry?.coordinates;

        if (!geometria?.length) throw new Error('Sin geometría vial');

        lineaRuta = L.polyline(
            geometria.map(([lng, lat]) => [lat, lng]),
            { color: '#2563eb', weight: 6, opacity: 0.9 }
        ).addTo(mapa);

        ordenActual = orden;
        actualizarPanelRuta();

        const km = ruta.distance / 1000;
        const minutos = ruta.duration / 60;

        escribir('ruta-distancia', `${km.toFixed(2)} km`);
        escribir('ruta-tiempo', `${Math.round(minutos)} min`);

        if (escenario === 'A' || escenario === 'B') {
            resultados[escenario] = {
                paradas: orden.length,
                litros,
                kilometros: km,
                minutos,
                orden: orden.map(p => ({
                    id: p.id_denue,
                    nombre: p.nombre,
                    litros: volumen(p)
                })),
                fecha: new Date().toLocaleString('es-MX')
            };

            actualizarComparacion();
            actualizarAnalitica();
        }

        mensaje(
            `Circuito calculado: ${km.toFixed(2)} km, ` +
            `${Math.round(minutos)} min de conducción.`
        );

        $('map').scrollIntoView({ behavior: 'smooth' });
        setTimeout(() => {
            mapa.invalidateSize();
            if (lineaRuta) {
                mapa.fitBounds(lineaRuta.getBounds(), {
                    padding: [45, 45]
                });
            }
        }, 250);

    } catch (error) {
        if (id !== solicitud || error.name === 'AbortError') return;

        console.error(error);
        mensaje(
            'No se pudo calcular la ruta. ' +
            'Revisa la conexión y vuelve a intentar.'
        );
    } finally {
        if (id === solicitud) {
            controlador = null;
            $('btn-calcular-recorrido').disabled = false;
        }
    }
}

/* COMPARACIÓN */

function resumen(letra) {
    const lista = grupo(letra);
    const litros = totalizar(lista).litros;

    return {
        paradas: lista.length,
        litros,
        porcentaje: litros / CONFIG.capacidad * 100
    };
}

function eficiencia(resultado) {
    return resultado && resultado.kilometros > 0
        ? resultado.litros / resultado.kilometros
        : null;
}

function crearPanelComparacion() {
    const panel = document.createElement('section');
    panel.id = 'panel-comparacion';
    panel.style.cssText = `
        background:white;border:1px solid #dce8e0;
        border-radius:16px;padding:22px;margin-top:24px`;

    panel.innerHTML = `
        <div class="d-flex flex-wrap justify-content-between
                    align-items-center gap-3 mb-3">
            <div>
                <h3 class="h5 fw-bold mb-1">
                    <i class="bi bi-bar-chart-line me-2"></i>
                    Comparación de rutas
                </h3>
                <p class="small text-muted mb-0">
                    Resultados de la simulación logística
                </p>
            </div>
            <button id="btn-exportar-reporte" type="button"
                class="btn btn-success btn-sm">
                <i class="bi bi-file-earmark-spreadsheet"></i>
                Exportar reporte CSV
            </button>
        </div>
        <div class="table-responsive">
            <table class="table table-bordered table-hover align-middle">
                <thead class="table-light">
                    <tr>
                        <th>Indicador</th><th>Ruta A</th><th>Ruta B</th>
                    </tr>
                </thead>
                <tbody id="tabla-comparacion"></tbody>
            </table>
        </div>
        <p id="conclusion-comparacion" class="small mb-2"></p>
        <p class="small text-muted mb-0">
            Volúmenes simulados. Las distancias y tiempos se
            obtienen de OSRM al calcular cada ruta.
        </p>`;

    $('rutas').appendChild(panel);

    $('btn-exportar-reporte').addEventListener(
        'click',
        exportarReporte
    );

    actualizarComparacion();
}

function actualizarComparacion() {
    const tbody = $('tabla-comparacion');
    if (!tbody) return;

    tbody.replaceChildren();

    const a = resumen('A');
    const b = resumen('B');
    const ra = resultados.A;
    const rb = resultados.B;
    const ea = eficiencia(ra);
    const eb = eficiencia(rb);

    [
        ['Establecimientos', a.paradas, b.paradas],
        ['AVU estimado', `${a.litros} L`, `${b.litros} L`],
        ['Capacidad', '300 L', '300 L'],
        [
            'Aprovechamiento',
            `${a.porcentaje.toFixed(1)}%`,
            `${b.porcentaje.toFixed(1)}%`
        ],
        [
            'Distancia',
            ra ? `${ra.kilometros.toFixed(2)} km` : 'Pendiente',
            rb ? `${rb.kilometros.toFixed(2)} km` : 'Pendiente'
        ],
        [
            'Conducción',
            ra ? `${Math.round(ra.minutos)} min` : 'Pendiente',
            rb ? `${Math.round(rb.minutos)} min` : 'Pendiente'
        ],
        [
            'Litros por km',
            ea === null ? 'Pendiente' : `${ea.toFixed(2)} L/km`,
            eb === null ? 'Pendiente' : `${eb.toFixed(2)} L/km`
        ]
    ].forEach(fila => crearFila(tbody, fila));

    let conclusion =
        'Calcula ambos circuitos para completar la comparación.';

    if (ea !== null && eb !== null) {
        conclusion = Math.abs(ea - eb) < 0.001
            ? 'Ambas rutas tienen una eficiencia similar en L/km.'
            : `La Ruta ${ea > eb ? 'A' : 'B'} presenta mayor ` +
              'volumen estimado por kilómetro. ' +
              'Esto no equivale a menor costo total.';
    }

    escribir('conclusion-comparacion', conclusion);
}

/* ANALÍTICA v2.3 */

function crearPanelAnalitica() {
    const panel = document.createElement('section');
    panel.id = 'panel-analitica';
    panel.style.cssText = `
        background:white;border:1px solid #dce8e0;
        border-radius:16px;padding:24px;margin-top:24px`;

    panel.innerHTML = `
        <div class="mb-4">
            <h3 class="h5 fw-bold mb-1">
                <i class="bi bi-graph-up-arrow me-2"></i>
                Panel de análisis logístico
            </h3>
            <p class="small text-muted mb-0">
                Indicadores de los escenarios simulados
            </p>
        </div>

        <div id="indicadores-analitica"
             class="row g-3 mb-4"></div>

        <div class="row g-4">
            <div class="col-12 col-lg-6">
                <h4 class="h6 fw-bold mb-3">
                    AVU estimado por ruta
                </h4>
                <div id="grafico-volumen"></div>
            </div>
            <div class="col-12 col-lg-6">
                <h4 class="h6 fw-bold mb-3">
                    Aprovechamiento del vehículo
                </h4>
                <div id="grafico-capacidad"></div>
            </div>
            <div class="col-12">
                <h4 class="h6 fw-bold mb-3">
                    Eficiencia de recolección
                </h4>
                <div id="grafico-eficiencia"></div>
            </div>
        </div>

        <div id="lectura-analitica"
             class="mt-4 p-3 rounded"
             style="background:#f0f8f2;font-size:14px"></div>

        <p class="small text-muted mt-3 mb-0">
            Los datos de AVU son estimaciones, no volúmenes
            recolectados o verificados. Los L/km representan
            un indicador comparativo, no una optimización
            certificada ni una medición de rentabilidad.
        </p>`;

    $('rutas').appendChild(panel);
    actualizarAnalitica();
}

function tarjetaIndicador(etiqueta, valor, detalle) {
    const col = document.createElement('div');
    col.className = 'col-12 col-md-4';

    const tarjeta = document.createElement('div');
    tarjeta.style.cssText = `
        background:#f8faf8;border:1px solid #e2ece4;
        border-radius:12px;padding:18px;height:100%`;

    const label = document.createElement('div');
    label.style.cssText = 'font-size:12px;color:#64766a';
    label.textContent = etiqueta;

    const numero = document.createElement('div');
    numero.style.cssText = `
        font-size:27px;font-weight:800;color:#173c29`;
    numero.textContent = valor;

    const nota = document.createElement('div');
    nota.style.cssText = 'font-size:12px;color:#64766a';
    nota.textContent = detalle;

    tarjeta.append(label, numero, nota);
    col.appendChild(tarjeta);

    return col;
}

function barraGrafico(etiqueta, valor, maximo, color, unidad) {
    const bloque = document.createElement('div');
    bloque.style.marginBottom = '20px';

    const cabecera = document.createElement('div');
    cabecera.style.cssText = `
        display:flex;justify-content:space-between;
        gap:12px;font-size:13px;margin-bottom:8px`;

    const nombre = document.createElement('strong');
    nombre.textContent = etiqueta;

    const cantidad = document.createElement('span');
    cantidad.textContent = `${valor.toFixed(2)} ${unidad}`;

    cabecera.append(nombre, cantidad);

    const pista = document.createElement('div');
    pista.style.cssText = `
        width:100%;height:18px;background:#edf1ee;
        border-radius:10px;overflow:hidden`;

    const relleno = document.createElement('div');
    relleno.style.cssText = `
        height:100%;background:${color};
        border-radius:10px;transition:width .4s ease`;

    relleno.style.width =
        `${Math.min(100, maximo > 0 ? valor / maximo * 100 : 0)}%`;

    pista.appendChild(relleno);
    bloque.append(cabecera, pista);

    return bloque;
}

function actualizarAnalitica() {
    const indicadores = $('indicadores-analitica');
    if (!indicadores) return;

    const a = resumen('A');
    const b = resumen('B');
    const ra = resultados.A;
    const rb = resultados.B;
    const ea = eficiencia(ra);
    const eb = eficiencia(rb);

    indicadores.replaceChildren(
        tarjetaIndicador(
            'AVU total estimado',
            `${a.litros + b.litros} L`,
            'Suma de los escenarios A y B'
        ),
        tarjetaIndicador(
            'Establecimientos',
            `${a.paradas + b.paradas}`,
            'Prospectos de ambas rutas'
        ),
        tarjetaIndicador(
            'Circuitos calculados',
            `${Number(Boolean(ra)) + Number(Boolean(rb))}/2`,
            'Con distancia y tiempo disponibles'
        )
    );

    const volumenContenedor = $('grafico-volumen');
    volumenContenedor.replaceChildren(
        barraGrafico('Ruta A', a.litros, CONFIG.capacidad, '#21845b', 'L'),
        barraGrafico('Ruta B', b.litros, CONFIG.capacidad, '#e3a008', 'L')
    );

    const capacidadContenedor = $('grafico-capacidad');
    capacidadContenedor.replaceChildren(
        barraGrafico(
            'Ruta A',
            a.porcentaje,
            100,
            '#21845b',
            '%'
        ),
        barraGrafico(
            'Ruta B',
            b.porcentaje,
            100,
            '#e3a008',
            '%'
        )
    );

    const eficienciaContenedor = $('grafico-eficiencia');
    eficienciaContenedor.replaceChildren();

    if (ea === null || eb === null) {
        const aviso = document.createElement('p');
        aviso.className = 'text-muted small';
        aviso.textContent =
            'Calcula las rutas A y B para visualizar ' +
            'la comparación de litros estimados por kilómetro.';
        eficienciaContenedor.appendChild(aviso);
    } else {
        const maximo = Math.max(ea, eb, 1);

        eficienciaContenedor.append(
            barraGrafico('Ruta A', ea, maximo, '#21845b', 'L/km'),
            barraGrafico('Ruta B', eb, maximo, '#e3a008', 'L/km')
        );
    }

    let lectura =
        'La Ruta A tiene mayor volumen estimado que la Ruta B. ' +
        'Calcula ambos circuitos para evaluar la eficiencia vial.';

    if (ea !== null && eb !== null) {
        const mejor = ea > eb ? 'A' : 'B';
        lectura =
            Math.abs(ea - eb) < 0.001
                ? 'Ambas rutas presentan eficiencia similar en L/km.'
                : `Según los recorridos calculados, la Ruta ${mejor} ` +
                  'presenta más litros estimados por kilómetro. ' +
                  'Este indicador no considera costos, tráfico ' +
                  'ni tiempos de servicio.';
    }

    escribir('lectura-analitica', lectura);
}

/* REPORTE CSV */

function csvSeguro(valor) {
    const original = String(valor ?? '');
    const seguro = /^[\s]*[=+\-@]/.test(original)
        ? "'" + original
        : original;

    return `"${seguro.replaceAll('"', '""')}"`;
}

function exportarReporte() {
    if (!datos.length) {
        alert('No hay datos para exportar.');
        return;
    }

    const a = resumen('A');
    const b = resumen('B');
    const ra = resultados.A;
    const rb = resultados.B;

    const filas = [
        ['BIOGIRO - Reporte académico de recolección'],
        ['Fecha', new Date().toLocaleString('es-MX')],
        ['Planta hipotética', CONFIG.direccion],
        ['Capacidad por vehículo (L)', CONFIG.capacidad],
        ['Nota', 'Volúmenes simulados; no recolecciones reales'],
        [],
        ['Indicador', 'Ruta A', 'Ruta B'],
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
            'Eficiencia (L/km)',
            eficiencia(ra)?.toFixed(2) ?? 'Pendiente',
            eficiencia(rb)?.toFixed(2) ?? 'Pendiente'
        ],
        [],
        [
            'Ruta', 'Orden', 'ID DENUE',
            'Establecimiento', 'AVU estimado (L)', 'Estado'
        ]
    ];

    ['A', 'B'].forEach(letra => {
        const r = resultados[letra];
        const lista = r
            ? r.orden
            : grupo(letra).map(p => ({
                id: p.id_denue,
                nombre: p.nombre,
                litros: volumen(p)
            }));

        filas.push([
            letra, 0, '', 'Salida: Planta BIOGIRO',
            '', r ? 'Calculado' : 'Pendiente'
        ]);

        lista.forEach((p, i) => {
            filas.push([
                letra, i + 1, p.id, p.nombre,
                p.litros ?? 'Pendiente',
                r ? 'Calculado' : 'Sin ordenar'
            ]);
        });

        filas.push([
            letra, lista.length + 1, '',
            'Regreso: Planta BIOGIRO', '',
            r ? 'Calculado' : 'Pendiente'
        ]);
    });

    filas.push(
        [],
        ['Nota', 'No se incluyen tráfico, carga, descarga ni costos.']
    );

    const contenido = '\uFEFF' + filas.map(fila =>
        fila.map(csvSeguro).join(';')
    ).join('\r\n');

    const blob = new Blob([contenido], {
        type: 'text/csv;charset=utf-8;'
    });

    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download =
        `BIOGIRO_Reporte_${new Date().toISOString().slice(0, 10)}.csv`;

    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* CARGA DE DATOS */

async function cargarEstablecimientos() {
    try {
        const respuesta = await fetch(
            'data/establecimientos.json',
            { cache: 'no-store' }
        );

        if (!respuesta.ok) {
            throw new Error(`HTTP ${respuesta.status}`);
        }

        const json = await respuesta.json();
        if (!Array.isArray(json)) {
            throw new Error('El JSON debe contener un arreglo.');
        }

        datos = json;

        escribir('total-establecimientos', datos.length);
        escribir('total-avu', `${totalizar(datos).litros} L`);

        escribir(
            'total-escenarios',
            new Set(
                datos.map(p => p.ruta_simulada).filter(Boolean)
            ).size
        );

        ['A', 'B'].forEach(letra => {
            const lista = grupo(letra);
            escribir(
                `resumen-ruta-${letra.toLowerCase()}`,
                `${lista.length} paradas · ` +
                `${totalizar(lista).litros} L simulados`
            );
        });

        aplicarFiltros();
        actualizarPanelRuta();
        actualizarComparacion();
        actualizarAnalitica();

        console.log(
            'BIOGIRO v2.3 listo:',
            datos.length,
            'establecimientos'
        );

    } catch (error) {
        console.error('Error al cargar datos:', error);
        mensaje(
            'No se pudieron cargar los establecimientos. ' +
            'Comprueba Live Server y la consola.'
        );
    }
}

/* EVENTOS */

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
    seleccion.clear();
    activarEscenario(null);
    mostrarTabla(visibles);
    mostrarMarcadores(visibles, false);
    actualizarPanelRuta();
    mensaje('Selección limpiada.');
});

/* INICIO */

crearPanelPlanta();
crearPanelComparacion();
crearPanelAnalitica();
cargarEstablecimientos();
localizarPlanta();
