
'use strict';

/*
 BIOGIRO v2.4
 Circular Nexum Industries
 Gestión logística y simulación académica de AVU.
*/

const CONFIG = {
    centro: [20.126, -98.734],
    capacidad: 300,
    direccion: 'Calle Mariano Abasolo 609, Centro, Pachuca de Soto, Hidalgo, México',
    geocoder: 'https://nominatim.openstreetmap.org/search',
    router: 'https://router.project-osrm.org/route/v1/driving/'
};

const $ = id => document.getElementById(id);

let establecimientos = [];
let visibles = [];
let escenario = null;
let tipoRuta = 'rutina';
let planta = null;
let marcadorPlanta = null;
let ajustandoPlanta = false;
let lineaRuta = null;
let controlador = null;
let solicitud = 0;
let ordenActual = null;

const seleccion = new Map();
const manual = new Map();
const resultados = { A: null, B: null };

const mapa = L.map('map').setView(CONFIG.centro, 15);

L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(mapa);

const capaProveedores = L.featureGroup().addTo(mapa);

const iconoPlanta = L.divIcon({
    className: '',
    html: `<div style="
        width:48px;height:48px;border-radius:50%;
        background:#173c29;color:white;
        border:4px solid white;box-shadow:0 3px 12px #0005;
        display:flex;align-items:center;justify-content:center;
        font-size:23px">
        <i class="bi bi-building-gear"></i>
    </div>`,
    iconSize: [48, 48],
    iconAnchor: [24, 24],
    popupAnchor: [0, -24]
});

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

function escribir(id, valor) {
    const el = $(id);
    if (el) el.textContent = String(valor);
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

    return Number.isFinite(lat) &&
        Number.isFinite(lng) &&
        Math.abs(lat) <= 90 &&
        Math.abs(lng) <= 180;
}

function totalizar(lista) {
    return {
        litros: lista.reduce(
            (s, p) => s + (volumen(p) ?? 0), 0
        ),
        pendientes: lista.filter(
            p => volumen(p) === null
        ).length
    };
}

function grupo(letra) {
    return establecimientos.filter(
        p => p.ruta_simulada === letra
    );
}

function celda(tr, valor, encabezado = false) {
    const td = document.createElement(
        encabezado ? 'th' : 'td'
    );
    td.textContent = String(valor ?? '');
    tr.appendChild(td);
    return td;
}

function fila(tbody, valores) {
    const tr = document.createElement('tr');
    valores.forEach((v, i) => celda(tr, v, i === 0));
    tbody.appendChild(tr);
}

function aviso(mensaje, error = false) {
    const el = $('app-notice');
    el.textContent = mensaje;
    el.classList.toggle('error', error);
    el.hidden = false;
}

function mensajeRuta(mensaje) {
    escribir('estado-recorrido', mensaje);
}

/* ==========================================
   NAVEGACIÓN ENTRE MÓDULOS
========================================== */

function cerrarMenu() {
    $('sidebar').classList.remove('open');
    $('mobile-overlay').classList.remove('open');
    $('menu-toggle').setAttribute('aria-expanded', 'false');
}

function navegar(id) {
    const vista = $(id);

    if (!vista || !vista.classList.contains('app-view')) {
        return;
    }

    document.querySelectorAll('.app-view').forEach(v => {
        v.classList.toggle('active', v.id === id);
    });

    document.querySelectorAll('.sidebar-nav .nav-link')
        .forEach(boton => {
            const activo = boton.dataset.view === id;
            boton.classList.toggle('active', activo);

            if (activo) {
                boton.setAttribute('aria-current', 'page');
            } else {
                boton.removeAttribute('aria-current');
            }
        });

    escribir('page-title', vista.dataset.title);
    escribir('page-description', vista.dataset.description);

    cerrarMenu();

    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (id === 'mapa') {
        setTimeout(() => mapa.invalidateSize(), 120);
    }
}

document.querySelectorAll('[data-view]').forEach(boton => {
    boton.addEventListener('click', () =>
        navegar(boton.dataset.view)
    );
});

document.querySelectorAll('[data-go]').forEach(boton => {
    boton.addEventListener('click', () =>
        navegar(boton.dataset.go)
    );
});

$('menu-toggle').addEventListener('click', () => {
    const abierto = $('sidebar').classList.toggle('open');
    $('mobile-overlay').classList.toggle('open', abierto);
    $('menu-toggle').setAttribute(
        'aria-expanded', String(abierto)
    );
});

$('mobile-overlay').addEventListener('click', cerrarMenu);

document.addEventListener('keydown', evento => {
    if (evento.key === 'Escape') cerrarMenu();
});

/* ==========================================
   PESTAÑAS DE RUTAS
========================================== */

function cambiarPestana(tipo) {
    tipoRuta = tipo;

    const rutina = tipo === 'rutina';

    $('panel-rutina').hidden = !rutina;
    $('panel-manual').hidden = rutina;

    $('tab-rutina').classList.toggle('active', rutina);
    $('tab-manual').classList.toggle('active', !rutina);

    $('tab-rutina').setAttribute(
        'aria-selected', String(rutina)
    );

    $('tab-manual').setAttribute(
        'aria-selected', String(!rutina)
    );
}

$('tab-rutina').addEventListener(
    'click', () => cambiarPestana('rutina')
);

$('tab-manual').addEventListener(
    'click', () => cambiarPestana('manual')
);

/* ==========================================
   PLANTA
========================================== */

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

function establecerPlanta(latitud, longitud, origen) {
    const lat = Number(latitud);
    const lng = Number(longitud);

    if (
        !Number.isFinite(lat) || !Number.isFinite(lng) ||
        Math.abs(lat) > 90 || Math.abs(lng) > 180
    ) return;

    const cambio = !planta ||
        planta.latitud !== lat ||
        planta.longitud !== lng;

    planta = { latitud: lat, longitud: lng, origen };

    if (!marcadorPlanta) {
        marcadorPlanta = L.marker([lat, lng], {
            icon: iconoPlanta,
            zIndexOffset: 1000
        }).addTo(mapa);
    } else {
        marcadorPlanta.setLatLng([lat, lng]);
    }

    const contenido = document.createElement('div');
    const titulo = document.createElement('strong');
    const direccion = document.createElement('p');

    titulo.textContent = 'PLANTA CIRCULAR NEXUM';
    direccion.textContent = CONFIG.direccion;

    contenido.append(titulo, direccion);
    marcadorPlanta.bindPopup(contenido);

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

        const respuesta = await fetch(
            `${CONFIG.geocoder}?${params}`
        );

        if (!respuesta.ok) {
            throw new Error('Geocodificación no disponible');
        }

        const opciones = await respuesta.json();

        const punto = opciones.find(p =>
            Number(p.lat) >= 20.10 &&
            Number(p.lat) <= 20.15 &&
            Number(p.lon) >= -98.77 &&
            Number(p.lon) <= -98.70
        );

        if (!punto) {
            throw new Error('No se encontró coincidencia confiable');
        }

        // No sobrescribir un ajuste manual realizado mientras
        // estaba pendiente la búsqueda automática.
        if (planta) return;

        establecerPlanta(
            punto.lat, punto.lon, 'Ubicación aproximada'
        );

    } catch (error) {
        console.warn(error);

        if (!planta) {
            escribir(
                'estado-planta',
                'No se encontró automáticamente. ' +
                'Usa Ajustar ubicación.'
            );
        }
    }
}

$('btn-ver-planta').addEventListener('click', () => {
    if (!planta) return;

    navegar('mapa');

    setTimeout(() => {
        mapa.invalidateSize();
        mapa.setView([planta.latitud, planta.longitud], 17);
        marcadorPlanta.openPopup();
    }, 200);
});

$('btn-ajustar-planta').addEventListener('click', () => {
    ajustandoPlanta = !ajustandoPlanta;

    $('btn-ajustar-planta').textContent = ajustandoPlanta
        ? 'Cancelar ajuste'
        : 'Ajustar ubicación';

    if (ajustandoPlanta) {
        escribir(
            'estado-planta',
            'Haz clic sobre el mapa para colocar la planta.'
        );
        navegar('mapa');
        aviso('Selecciona en el mapa la ubicación de la planta.');
    } else if (planta) {
        escribir(
            'estado-planta',
            `${planta.origen}: ` +
            `${planta.latitud.toFixed(6)}, ` +
            `${planta.longitud.toFixed(6)}`
        );
    }
});

mapa.on('click', evento => {
    if (!ajustandoPlanta) return;

    establecerPlanta(
        evento.latlng.lat,
        evento.latlng.lng,
        'Ubicación ajustada manualmente'
    );

    ajustandoPlanta = false;
    $('btn-ajustar-planta').textContent = 'Ajustar ubicación';

    marcadorPlanta.openPopup();
    aviso('Ubicación de la planta actualizada.');
});

/* ==========================================
   MAPA Y DIRECTORIO
========================================== */

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

        const popup = document.createElement('div');
        const titulo = document.createElement('strong');
        titulo.textContent = p.nombre || 'Sin nombre';
        popup.appendChild(titulo);

        [
            p.direccion || 'Sin dirección',
            `AVU habitual: ${volumen(p) ?? 'Pendiente'} L`,
            `Ruta: ${p.ruta_simulada || 'Sin asignar'}`
        ].forEach(texto => {
            const parrafo = document.createElement('p');
            parrafo.textContent = texto;
            popup.appendChild(parrafo);
        });

        marcador.bindPopup(popup);
        capaProveedores.addLayer(marcador);
    });

    // No intentar ajustar el mapa si su módulo está oculto.
    if (
        ajustar &&
        $('mapa').classList.contains('active') &&
        capaProveedores.getLayers().length
    ) {
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
        const td = celda(tr, 'Sin resultados');
        td.colSpan = 6;
        tbody.appendChild(tr);
        return;
    }

    lista.forEach(p => {
        const tr = document.createElement('tr');
        const tdCheck = document.createElement('td');
        const check = document.createElement('input');

        check.type = 'checkbox';
        check.className = 'checkbox-ruta';
        check.checked = seleccion.has(String(p.id_denue));
        check.setAttribute(
            'aria-label',
            `Seleccionar ${p.nombre || p.id_denue}`
        );

        check.addEventListener('change', () => {
            seleccionarDesdeDirectorio(p, check.checked);
        });

        tdCheck.appendChild(check);
        tr.appendChild(tdCheck);

        celda(tr, p.nombre || 'Sin nombre');
        celda(tr, p.actividad || 'No especificada');

        celda(
            tr,
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
        tr.appendChild(tdPrioridad);

        celda(tr, p.estado || 'Prospecto');
        tbody.appendChild(tr);
    });
}

function aplicarFiltros() {
    const q = $('buscar-establecimiento')
        .value.toLocaleLowerCase('es').trim();

    const prioridad = $('filtro-prioridad').value;

    const lista = establecimientos.filter(p => {
        const cadena = [
            p.nombre, p.actividad, p.id_denue
        ].join(' ').toLocaleLowerCase('es');

        return cadena.includes(q) &&
            (prioridad === 'todos' ||
             p.prioridad === prioridad);
    });

    mostrarTabla(lista);
    mostrarMarcadores(lista, false);

    escribir(
        'contador-resultados',
        `${lista.length} de ${establecimientos.length} resultados`
    );
}

$('buscar-establecimiento').addEventListener(
    'input', aplicarFiltros
);

$('filtro-prioridad').addEventListener(
    'change', aplicarFiltros
);

$('btn-centrar-mapa').addEventListener('click', () => {
    mapa.invalidateSize();

    if (capaProveedores.getLayers().length) {
        mapa.fitBounds(capaProveedores.getBounds(), {
            padding: [40, 40],
            maxZoom: 16
        });
    }
});

/* ==========================================
   SELECCIÓN DE RUTAS
========================================== */

function activarEscenario(letra) {
    escenario = letra;

    ['A', 'B'].forEach(clave => {
        const boton = $(`btn-ruta-${clave.toLowerCase()}`);
        const activo = clave === letra;

        boton.classList.toggle('activa', activo);
        boton.setAttribute('aria-pressed', String(activo));
    });
}

function cargarEscenario(letra) {
    const lista = grupo(letra);

    if (!lista.length) {
        aviso(`La Ruta ${letra} no tiene establecimientos.`, true);
        return;
    }

    invalidarRecorrido();
    seleccion.clear();

    lista.forEach(p => {
        seleccion.set(String(p.id_denue), { ...p });
    });

    activarEscenario(letra);
    cambiarPestana('rutina');

    escribir('tipo-ruta-activa', `Ruta de rutina ${letra}`);

    actualizarPanelRuta();
    aplicarFiltros();

    mensajeRuta(
        `Ruta ${letra} cargada. Calcula el circuito vial.`
    );

    aviso(`Ruta de rutina ${letra} preparada.`);
}

$('btn-ruta-a').addEventListener(
    'click', () => cargarEscenario('A')
);

$('btn-ruta-b').addEventListener(
    'click', () => cargarEscenario('B')
);

function seleccionarDesdeDirectorio(p, activo) {
    // La selección directa crea una ruta manual.
    // Se conservan los volúmenes habituales como valor inicial.
    invalidarRecorrido();
    activarEscenario(null);
    cambiarPestana('manual');

    const id = String(p.id_denue);

    if (activo) {
        if (!manual.has(id)) {
            manual.set(id, volumen(p) ?? 0);
        }
    } else {
        manual.delete(id);
    }

    sincronizarSeleccionManual();

    escribir('tipo-ruta-activa', 'Ruta manual');
    mensajeRuta(
        'Selección manual modificada. Calcula el recorrido.'
    );
}

$('btn-ir-ruta').addEventListener('click', () => {
    cambiarPestana(escenario ? 'rutina' : 'manual');
    navegar('rutas');
});

/* ==========================================
   RUTAS MANUALES
========================================== */

function mostrarTablaManual() {
    const tbody = $('tabla-manual');
    tbody.replaceChildren();

    const q = $('manual-buscar')
        .value.toLocaleLowerCase('es').trim();

    const lista = establecimientos.filter(p =>
        [p.nombre, p.id_denue]
            .join(' ')
            .toLocaleLowerCase('es')
            .includes(q)
    );

    escribir(
        'manual-contador',
        `${lista.length} establecimientos`
    );

    lista.forEach(p => {
        const id = String(p.id_denue);
        const tr = document.createElement('tr');

        const tdCheck = document.createElement('td');
        const check = document.createElement('input');

        check.type = 'checkbox';
        check.className = 'checkbox-ruta';
        check.checked = manual.has(id);
        check.setAttribute(
            'aria-label',
            `Agregar ${p.nombre || id}`
        );

        tdCheck.appendChild(check);
        tr.appendChild(tdCheck);

        celda(tr, p.nombre || 'Sin nombre');

        celda(
            tr,
            volumen(p) === null
                ? 'Sin dato'
                : `${volumen(p)} L`
        );

        const tdVolumen = document.createElement('td');
        const input = document.createElement('input');

        input.type = 'number';
        input.className = 'manual-volume';
        input.min = '0';
        input.max = String(CONFIG.capacidad);
        input.step = '0.1';
        input.disabled = !manual.has(id);

        input.value = manual.has(id)
            ? String(manual.get(id))
            : String(volumen(p) ?? 0);

        input.setAttribute(
            'aria-label',
            `Litros disponibles en ${p.nombre || id}`
        );

        tdVolumen.appendChild(input);
        tr.appendChild(tdVolumen);

        check.addEventListener('change', () => {
            if (check.checked) {
                const valor = numero(input.value);

                manual.set(
                    id,
                    valor === null
                        ? (volumen(p) ?? 0)
                        : valor
                );
            } else {
                manual.delete(id);
            }

            input.disabled = !check.checked;

            if (check.checked) {
                input.value = String(manual.get(id));
            }

            sincronizarSeleccionManual();
        });

        input.addEventListener('change', () => {
            const valor = numero(input.value);

            if (
                valor === null ||
                valor > CONFIG.capacidad
            ) {
                aviso(
                    `Introduce un volumen entre 0 y ` +
                    `${CONFIG.capacidad} L.`,
                    true
                );

                input.value = String(manual.get(id) ?? 0);
                return;
            }

            manual.set(id, valor);
            sincronizarSeleccionManual();
        });

        tbody.appendChild(tr);
    });
}

function sincronizarSeleccionManual() {
    invalidarRecorrido();
    seleccion.clear();
    activarEscenario(null);

    establecimientos.forEach(p => {
        const id = String(p.id_denue);

        if (!manual.has(id)) return;

        seleccion.set(id, {
            ...p,
            avu_estimado: manual.get(id)
        });
    });

    escribir('tipo-ruta-activa', 'Ruta manual');

    const { litros } = totalizar([...seleccion.values()]);

    escribir('manual-total-paradas', seleccion.size);
    escribir('manual-total-litros', `${litros.toFixed(1)} L`);

    actualizarPanelRuta();
    aplicarFiltros();
}

$('manual-buscar').addEventListener(
    'input', mostrarTablaManual
);

$('btn-aplicar-manual').addEventListener('click', () => {
    sincronizarSeleccionManual();

    if (!seleccion.size) {
        aviso('Selecciona al menos un establecimiento.', true);
        return;
    }

    cambiarPestana('manual');

    aviso(
        `Ruta manual preparada: ${seleccion.size} paradas.`
    );

    mensajeRuta(
        'Ruta extraordinaria preparada. Calcula el circuito.'
    );
});

$('btn-limpiar-manual').addEventListener('click', () => {
    manual.clear();
    sincronizarSeleccionManual();
    mostrarTablaManual();
    mensajeRuta('Ruta manual limpiada.');
    aviso('Selección manual limpiada.');
});

/* ==========================================
   MÉTRICAS Y PARADAS
========================================== */

function agregarParada(ul, nombre, detalle, plantaStop = false) {
    const li = document.createElement('li');
    const span1 = document.createElement('span');
    const span2 = document.createElement('span');

    span1.className = 'stop-name';
    span2.className = 'stop-volume';

    span1.textContent = nombre;
    span2.textContent = detalle;

    if (plantaStop) li.classList.add('plant-stop');

    li.append(span1, span2);
    ul.appendChild(li);
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

    progreso.style.width =
        `${Math.min(100, porcentaje)}%`;

    progreso.setAttribute(
        'aria-valuenow',
        String(Math.min(100, porcentaje))
    );

    progreso.classList.toggle(
        'bg-danger', porcentaje > 100
    );

    const ul = $('lista-ruta');
    ul.replaceChildren();

    if (!lista.length) {
        agregarParada(
            ul,
            'Selecciona una ruta o establecimientos.',
            ''
        );
        return;
    }

    if (planta) {
        agregarParada(
            ul,
            'Salida: Planta Circular Nexum',
            'Planta',
            true
        );
    }

    (ordenActual || lista).forEach(p => {
        agregarParada(
            ul,
            p.nombre || 'Sin nombre',
            `${volumen(p) ?? 'Pendiente'} L`
        );
    });

    if (planta) {
        agregarParada(
            ul,
            'Regreso: Planta Circular Nexum',
            'Planta',
            true
        );
    }

    if (porcentaje > 100) {
        agregarParada(
            ul,
            'Capacidad del vehículo superada',
            'Aviso'
        );
    } else if (pendientes) {
        agregarParada(
            ul,
            'Hay volúmenes pendientes',
            'Aviso'
        );
    }
}

function mostrarSeleccionEnMapa() {
    const puntos = [...seleccion.values()]
        .filter(coordenadaValida)
        .map(p => [
            Number(p.latitud),
            Number(p.longitud)
        ]);

    if (planta) {
        puntos.push([
            planta.latitud,
            planta.longitud
        ]);
    }

    if (!puntos.length) {
        aviso('Selecciona establecimientos.', true);
        return;
    }

    navegar('mapa');

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
    }, 200);
}

$('btn-ver-seleccion').addEventListener(
    'click', mostrarSeleccionEnMapa
);

$('btn-limpiar-ruta').addEventListener('click', () => {
    invalidarRecorrido();
    seleccion.clear();
    manual.clear();
    activarEscenario(null);

    escribir(
        'tipo-ruta-activa',
        'Ningún recorrido seleccionado.'
    );

    actualizarPanelRuta();
    aplicarFiltros();
    mostrarTablaManual();

    mensajeRuta('Selección limpiada.');
    aviso('Recorrido seleccionado limpiado.');
});

/* ==========================================
   CÁLCULO VIAL
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

function ordenarParadas(lista) {
    const pendientes = [...lista];
    const orden = [];
    let actual = planta;

    while (pendientes.length) {
        let indice = 0;
        let mejor = Infinity;

        pendientes.forEach((p, i) => {
            const distancia = distanciaGeografica(actual, p);

            if (distancia < mejor) {
                mejor = distancia;
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
        aviso(
            'Primero debes ubicar la planta de producción.',
            true
        );
        return;
    }

    const lista = [...seleccion.values()];

    if (!lista.length) {
        aviso(
            'Selecciona al menos un establecimiento.',
            true
        );
        return;
    }

    if (!lista.every(coordenadaValida)) {
        aviso(
            'Hay establecimientos sin coordenadas válidas.',
            true
        );
        return;
    }

    const { litros, pendientes } = totalizar(lista);

    if (litros > CONFIG.capacidad) {
        aviso(
            'La ruta supera la capacidad del vehículo de 300 L.',
            true
        );
        return;
    }

    if (pendientes) {
        aviso(
            'Existen establecimientos sin volumen estimado.',
            true
        );
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

    mensajeRuta(
        'Calculando circuito de salida y regreso a la planta...'
    );

    try {
        const respuesta = await fetch(url, {
            signal: controller.signal
        });

        if (!respuesta.ok) {
            throw new Error(`HTTP ${respuesta.status}`);
        }

        const json = await respuesta.json();

        if (id !== solicitud) return;

        if (json.code !== 'Ok' || !json.routes?.length) {
            throw new Error('El servicio no encontró una ruta.');
        }

        const ruta = json.routes[0];
        const geometria = ruta.geometry?.coordinates;

        if (!geometria?.length) {
            throw new Error('El recorrido no tiene geometría.');
        }

        lineaRuta = L.polyline(
            geometria.map(([lng, lat]) => [lat, lng]),
            {
                color: '#2563eb',
                weight: 6,
                opacity: .9
            }
        ).addTo(mapa);

        ordenActual = orden;
        actualizarPanelRuta();

        const kilometros = ruta.distance / 1000;
        const minutos = ruta.duration / 60;

        escribir(
            'ruta-distancia',
            `${kilometros.toFixed(2)} km`
        );

        escribir(
            'ruta-tiempo',
            `${Math.round(minutos)} min`
        );

        // Solo los escenarios de rutina alimentan
        // la comparación histórica A/B.
        if (escenario === 'A' || escenario === 'B') {
            resultados[escenario] = {
                paradas: orden.length,
                litros,
                kilometros,
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

        mensajeRuta(
            `Circuito calculado: ${kilometros.toFixed(2)} km, ` +
            `${Math.round(minutos)} min de conducción.`
        );

        aviso('Recorrido calculado correctamente.');

        navegar('mapa');

        setTimeout(() => {
            mapa.invalidateSize();

            if (lineaRuta) {
                mapa.fitBounds(lineaRuta.getBounds(), {
                    padding: [45, 45]
                });
            }
        }, 200);

    } catch (error) {
        if (
            id !== solicitud ||
            error.name === 'AbortError'
        ) return;

        console.error(error);

        mensajeRuta(
            'No fue posible calcular el recorrido. ' +
            'Revisa tu conexión e intenta nuevamente.'
        );

        aviso(
            'El servicio de rutas no respondió correctamente.',
            true
        );

    } finally {
        if (id === solicitud) {
            controlador = null;
            $('btn-calcular-recorrido').disabled = false;
        }
    }
}

$('btn-calcular-recorrido').addEventListener(
    'click', calcularRecorrido
);

/* ==========================================
   COMPARACIÓN
========================================== */

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

function actualizarComparacion() {
    const tbody = $('tabla-comparacion');
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
    ].forEach(valores => fila(tbody, valores));

    let conclusion =
        'Calcula las rutas A y B para comparar su eficiencia vial.';

    if (ea !== null && eb !== null) {
        conclusion = Math.abs(ea - eb) < .001
            ? 'Ambas rutas tienen una eficiencia similar.'
            : `La Ruta ${ea > eb ? 'A' : 'B'} presenta más ` +
              'litros estimados por kilómetro. ' +
              'Esto no implica necesariamente un menor costo.';
    }

    escribir('conclusion-comparacion', conclusion);
}

/* ==========================================
   GRÁFICAS E INDICADORES
========================================== */

function tarjetaAnalitica(etiqueta, valor, detalle) {
    const div = document.createElement('div');
    div.className = 'analytics-card';

    const label = document.createElement('span');
    const numero = document.createElement('strong');
    const nota = document.createElement('small');

    label.textContent = etiqueta;
    numero.textContent = valor;
    nota.textContent = detalle;

    div.append(label, numero, nota);
    return div;
}

function barra(etiqueta, valor, maximo, clase, unidad) {
    const contenedor = document.createElement('div');
    contenedor.className = 'bar-item';

    const cabecera = document.createElement('div');
    cabecera.className = 'bar-heading';

    const titulo = document.createElement('strong');
    titulo.textContent = etiqueta;

    const cantidad = document.createElement('span');
    cantidad.textContent = `${valor.toFixed(2)} ${unidad}`;

    cabecera.append(titulo, cantidad);

    const pista = document.createElement('div');
    pista.className = 'bar-track';

    const relleno = document.createElement('div');
    relleno.className = `bar-fill ${clase}`;

    relleno.style.width =
        `${Math.min(100, maximo > 0 ? valor / maximo * 100 : 0)}%`;

    pista.appendChild(relleno);
    contenedor.append(cabecera, pista);

    return contenedor;
}

function actualizarAnalitica() {
    const a = resumen('A');
    const b = resumen('B');

    const ra = resultados.A;
    const rb = resultados.B;

    const ea = eficiencia(ra);
    const eb = eficiencia(rb);

    $('indicadores-analitica').replaceChildren(
        tarjetaAnalitica(
            'AVU total estimado',
            `${a.litros + b.litros} L`,
            'Suma de las rutas de rutina'
        ),
        tarjetaAnalitica(
            'Establecimientos',
            a.paradas + b.paradas,
            'Prospectos identificados'
        ),
        tarjetaAnalitica(
            'Circuitos calculados',
            `${Number(Boolean(ra)) + Number(Boolean(rb))}/2`,
            'Rutas con datos viales'
        )
    );

    $('grafico-volumen').replaceChildren(
        barra('Ruta A', a.litros, CONFIG.capacidad, 'green', 'L'),
        barra('Ruta B', b.litros, CONFIG.capacidad, 'gold', 'L')
    );

    $('grafico-capacidad').replaceChildren(
        barra('Ruta A', a.porcentaje, 100, 'green', '%'),
        barra('Ruta B', b.porcentaje, 100, 'gold', '%')
    );

    const contenedor = $('grafico-eficiencia');
    contenedor.replaceChildren();

    if (ea === null || eb === null) {
        const p = document.createElement('p');
        p.className = 'small text-muted mb-0';

        p.textContent =
            'Calcula ambas rutas de rutina para ' +
            'visualizar los litros estimados por kilómetro.';

        contenedor.appendChild(p);
    } else {
        const maximo = Math.max(ea, eb, 1);

        contenedor.append(
            barra('Ruta A', ea, maximo, 'green', 'L/km'),
            barra('Ruta B', eb, maximo, 'gold', 'L/km')
        );
    }

    escribir(
        'lectura-analitica',
        ea !== null && eb !== null
            ? (
                Math.abs(ea - eb) < .001
                    ? 'Ambos circuitos presentan una eficiencia similar.'
                    : `La Ruta ${ea > eb ? 'A' : 'B'} presenta ` +
                      'mayor volumen estimado por kilómetro.'
              )
            : 'Las rutas A y B están preparadas. ' +
              'Calcula sus circuitos para completar el análisis.'
    );

    $('dashboard-route-summary').replaceChildren(
        barra('Ruta A', a.litros, CONFIG.capacidad, 'green', 'L'),
        barra('Ruta B', b.litros, CONFIG.capacidad, 'gold', 'L')
    );
}

/* ==========================================
   EXPORTACIÓN CSV
========================================== */

function csvSeguro(valor) {
    const original = String(valor ?? '');

    const seguro = /^[\s]*[=+\-@]/.test(original)
        ? "'" + original
        : original;

    return `"${seguro.replaceAll('"', '""')}"`;
}

function exportarReporte() {
    if (!establecimientos.length) {
        aviso('No hay datos para exportar.', true);
        return;
    }

    const a = resumen('A');
    const b = resumen('B');

    const ra = resultados.A;
    const rb = resultados.B;

    const filas = [
        ['BIOGIRO - Circular Nexum Industries'],
        ['Reporte académico de simulación logística'],
        ['Fecha', new Date().toLocaleString('es-MX')],
        ['Planta hipotética', CONFIG.direccion],
        ['Capacidad del vehículo (L)', CONFIG.capacidad],
        ['Nota', 'Volúmenes simulados, no verificados'],
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
            'Conducción (min)',
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
            letra, 0, '', 'Salida: Planta Circular Nexum',
            '', r ? 'Calculado' : 'Pendiente'
        ]);

        lista.forEach((p, i) => {
            filas.push([
                letra,
                i + 1,
                p.id,
                p.nombre,
                p.litros ?? 'Pendiente',
                r ? 'Calculado' : 'Sin ordenar'
            ]);
        });

        filas.push([
            letra,
            lista.length + 1,
            '',
            'Regreso: Planta Circular Nexum',
            '',
            r ? 'Calculado' : 'Pendiente'
        ]);
    });

    filas.push(
        [],
        [
            'Nota',
            'No incluye tráfico, carga, descarga ni costos.'
        ]
    );

    const contenido = '\uFEFF' + filas.map(f =>
        f.map(csvSeguro).join(';')
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

    aviso('Reporte CSV exportado.');
}

$('btn-exportar-reporte').addEventListener(
    'click', exportarReporte
);

/* ==========================================
   CARGA DE ESTABLECIMIENTOS
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

        const json = await respuesta.json();

        if (!Array.isArray(json)) {
            throw new Error('El JSON debe ser un arreglo.');
        }

        establecimientos = json;

        escribir(
            'total-establecimientos',
            establecimientos.length
        );

        escribir(
            'total-avu',
            `${totalizar(establecimientos).litros} L`
        );

        escribir(
            'total-escenarios',
            new Set(
                establecimientos
                    .map(p => p.ruta_simulada)
                    .filter(Boolean)
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
        mostrarTablaManual();
        actualizarPanelRuta();
        actualizarComparacion();
        actualizarAnalitica();

        console.log(
            'BIOGIRO v2.4 cargado:',
            establecimientos.length,
            'establecimientos'
        );

    } catch (error) {
        console.error(error);

        aviso(
            'No se pudieron cargar los establecimientos. ' +
            'Verifica Live Server y el archivo JSON.',
            true
        );
    }
}

/* ==========================================
   INICIALIZACIÓN
========================================== */

actualizarPanelRuta();
cargarEstablecimientos();
localizarPlanta();
navegar('dashboard');
