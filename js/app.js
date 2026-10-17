
/* =========================================
   BIOGIRO - SISTEMA DE RECOLECCIÓN AVU
   Prototipo web con DENUE y Leaflet
========================================= */

// CONFIGURACIÓN GENERAL

const centroPachuca = [20.1211, -98.7355];
const capacidadVehiculo = 300;

const proveedoresSeleccionados = new Map();

let establecimientosVisibles = [];
let todosEstablecimientos = [];

// MAPA

const mapa = L.map('map').setView(centroPachuca, 14);

L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19
}).addTo(mapa);

// Referencia geográfica inicial, no microplanta real
const marcadorCentro = L.marker(centroPachuca).addTo(mapa);

marcadorCentro.bindPopup(`
    <strong>BIOGIRO</strong>
    <p>Centro de Pachuca, Hidalgo</p>
    <small>Referencia geográfica inicial.</small>
`);

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

// CARGAR DATOS

async function cargarEstablecimientos() {
    try {
        const respuesta = await fetch('data/establecimientos.json');

        if (!respuesta.ok) {
            throw new Error(`Error HTTP: ${respuesta.status}`);
        }

        const establecimientos = await respuesta.json();

        if (!Array.isArray(establecimientos)) {
            throw new Error('El archivo JSON debe contener un arreglo.');
        }

        todosEstablecimientos = establecimientos;

        console.log('Establecimientos cargados:', establecimientos);
        console.log('Total de registros:', establecimientos.length);

        const conteoPrioridades = {};

        establecimientos.forEach(est => {
            const prioridad = est.prioridad || 'Sin evaluar';

            conteoPrioridades[prioridad] =
                (conteoPrioridades[prioridad] || 0) + 1;
        });

        console.table(conteoPrioridades);

        document.getElementById('total-establecimientos').textContent =
            establecimientos.length;

        mostrarEstablecimientos(establecimientos);
        mostrarMarcadores(establecimientos);

        inicializarFiltros(establecimientos);
        actualizarPanelRuta();

    } catch (error) {
        console.error('Error al cargar establecimientos:', error);

        document.getElementById('tabla-establecimientos').innerHTML =
            '<tr><td colspan="5">No fue posible cargar los establecimientos.</td></tr>';
    }
}

// TABLA DINÁMICA

function mostrarEstablecimientos(establecimientos) {
    const tabla = document.getElementById('tabla-establecimientos');
    tabla.innerHTML = '';

    if (establecimientos.length === 0) {
        const fila = document.createElement('tr');
        const celda = document.createElement('td');

        celda.colSpan = 5;
        celda.textContent = 'No se encontraron establecimientos.';
        celda.className = 'text-center text-muted py-4';

        fila.appendChild(celda);
        tabla.appendChild(fila);
        return;
    }

    establecimientos.forEach(establecimiento => {
        const fila = document.createElement('tr');

        const celdaSeleccion = document.createElement('td');
        const checkbox = document.createElement('input');

        checkbox.type = 'checkbox';
        checkbox.className = 'checkbox-ruta';
        checkbox.checked = proveedoresSeleccionados.has(
            String(establecimiento.id_denue)
        );

        checkbox.addEventListener('change', () => {
            seleccionarProveedor(establecimiento, checkbox.checked);
        });

        celdaSeleccion.appendChild(checkbox);

        const celdaNombre = document.createElement('td');
        celdaNombre.textContent = establecimiento.nombre || 'Sin nombre';

        const celdaActividad = document.createElement('td');
        celdaActividad.textContent =
            establecimiento.actividad || 'No especificada';

        const celdaAceite = document.createElement('td');
        const aceite = establecimiento.avu_estimado;

        celdaAceite.textContent =
            aceite !== null && aceite !== undefined && aceite !== ''
                ? `${aceite} L (simulado)`
                : 'Pendiente de evaluación';

        const celdaEstado = document.createElement('td');
        const etiqueta = document.createElement('span');

        etiqueta.className = 'status-badge';
        etiqueta.textContent = establecimiento.estado || 'Prospecto';

        celdaEstado.appendChild(etiqueta);

        fila.append(
            celdaSeleccion,
            celdaNombre,
            celdaActividad,
            celdaAceite,
            celdaEstado
        );

        tabla.appendChild(fila);
    });
}

// MAPA DE PROVEEDORES

function mostrarMarcadores(establecimientos, ajustarVista = true) {
    establecimientosVisibles = establecimientos;

    capaProveedores.clearLayers();

    establecimientos.forEach(establecimiento => {
        const lat = Number(establecimiento.latitud);
        const lng = Number(establecimiento.longitud);

        if (
            establecimiento.latitud === null ||
            establecimiento.longitud === null ||
            establecimiento.latitud === undefined ||
            establecimiento.longitud === undefined ||
            !Number.isFinite(lat) ||
            !Number.isFinite(lng) ||
            lat < -90 || lat > 90 ||
            lng < -180 || lng > 180
        ) {
            console.warn(
                'Coordenadas no válidas:',
                establecimiento.nombre
            );
            return;
        }

        const id = String(establecimiento.id_denue);
        const seleccionado = proveedoresSeleccionados.has(id);

        const marcador = L.marker([lat, lng], {
            icon: seleccionado
                ? iconoProveedorSeleccionado
                : iconoProveedor
        });

        const popup = document.createElement('div');
        popup.className = 'popup-biogiro';

        const titulo = document.createElement('h6');
        titulo.textContent = establecimiento.nombre || 'Sin nombre';

        const actividad = document.createElement('p');
        actividad.textContent =
            `Actividad: ${establecimiento.actividad || 'No especificada'}`;

        const denue = document.createElement('p');
        denue.textContent =
            `ID DENUE: ${establecimiento.id_denue || 'No disponible'}`;

        const direccion = document.createElement('p');
        direccion.textContent =
            `Dirección: ${establecimiento.direccion || 'No disponible'}`;

        const volumen = document.createElement('p');
        const aceite = establecimiento.avu_estimado;

        volumen.textContent =
            aceite !== null && aceite !== undefined && aceite !== ''
                ? `AVU estimado: ${aceite} L (simulado)`
                : 'AVU estimado: pendiente de evaluación';

        const estado = document.createElement('p');
        estado.textContent =
            `Estado: ${establecimiento.estado || 'Prospecto'}`;

        popup.append(
            titulo,
            actividad,
            denue,
            direccion,
            volumen,
            estado
        );

        marcador.bindPopup(popup);
        capaProveedores.addLayer(marcador);
    });

    if (ajustarVista && capaProveedores.getLayers().length > 0) {
        mapa.fitBounds(capaProveedores.getBounds(), {
            padding: [40, 40],
            maxZoom: 16
        });
    }

    console.log(
        'Marcadores de proveedores:',
        capaProveedores.getLayers().length
    );
}

// FILTROS

function inicializarFiltros(establecimientos) {
    const campoBusqueda = document.getElementById(
        'buscar-establecimiento'
    );

    const filtroPrioridad = document.getElementById(
        'filtro-prioridad'
    );

    const contador = document.getElementById(
        'contador-resultados'
    );

    function aplicarFiltros() {
        const texto = campoBusqueda.value.toLowerCase().trim();
        const prioridad = filtroPrioridad.value;

        const resultados = establecimientos.filter(est => {
            const nombre = String(est.nombre || '').toLowerCase();
            const actividad = String(est.actividad || '').toLowerCase();
            const id = String(est.id_denue || '').toLowerCase();

            const prioridadRegistro = est.prioridad || 'Sin evaluar';

            const coincideBusqueda =
                nombre.includes(texto) ||
                actividad.includes(texto) ||
                id.includes(texto);

            const coincidePrioridad =
                prioridad === 'todos' ||
                prioridadRegistro === prioridad;

            return coincideBusqueda && coincidePrioridad;
        });

        mostrarEstablecimientos(resultados);
        mostrarMarcadores(resultados);

        contador.textContent =
            `${resultados.length} de ${establecimientos.length} resultados`;
    }

    campoBusqueda.addEventListener('input', aplicarFiltros);
    filtroPrioridad.addEventListener('change', aplicarFiltros);

    contador.textContent =
        `${establecimientos.length} de ${establecimientos.length} resultados`;
}

// SELECCIÓN DE PROVEEDORES

function seleccionarProveedor(establecimiento, seleccionado) {
    const id = String(establecimiento.id_denue);

    if (seleccionado) {
        proveedoresSeleccionados.set(id, establecimiento);
    } else {
        proveedoresSeleccionados.delete(id);
    }

    actualizarPanelRuta();

    // Cambiar colores sin modificar la vista del mapa
    mostrarMarcadores(establecimientosVisibles, false);
}

// PANEL DE RUTAS

function actualizarPanelRuta() {
    const proveedores = Array.from(proveedoresSeleccionados.values());

    let totalLitros = 0;
    let volumenesPendientes = 0;

    proveedores.forEach(proveedor => {
        const valor = proveedor.avu_estimado;

        if (valor === null || valor === undefined || valor === '') {
            volumenesPendientes++;
            return;
        }

        const litros = Number(valor);

        if (Number.isFinite(litros) && litros >= 0) {
            totalLitros += litros;
        } else {
            volumenesPendientes++;
        }
    });

    const porcentaje = (totalLitros / capacidadVehiculo) * 100;

    document.getElementById('ruta-total-paradas').textContent =
        proveedores.length;

    document.getElementById('ruta-total-litros').textContent =
        `${totalLitros.toFixed(1)} L`;

    document.getElementById('ruta-capacidad').textContent =
        `${capacidadVehiculo} L`;

    document.getElementById('ruta-porcentaje').textContent =
        `${porcentaje.toFixed(1)}%`;

    const progreso = document.getElementById('ruta-progreso');

    progreso.style.width = `${Math.min(porcentaje, 100)}%`;
    progreso.setAttribute(
        'aria-valuenow',
        Math.min(porcentaje, 100)
    );

    progreso.classList.toggle('bg-danger', porcentaje > 100);

    const lista = document.getElementById('lista-ruta');
    lista.innerHTML = '';

    if (proveedores.length === 0) {
        const mensaje = document.createElement('li');
        mensaje.className = 'ruta-vacia';
        mensaje.textContent =
            'Selecciona establecimientos desde la tabla.';
        lista.appendChild(mensaje);
        return;
    }

    proveedores.forEach(proveedor => {
        const elemento = document.createElement('li');
        const aceite = proveedor.avu_estimado;

        elemento.textContent =
            `${proveedor.nombre} | ${
                aceite === null || aceite === undefined || aceite === ''
                    ? 'Volumen pendiente'
                    : `${aceite} L estimados`
            }`;

        lista.appendChild(elemento);
    });

    if (porcentaje > 100) {
        const advertencia = document.createElement('li');
        advertencia.className = 'text-danger fw-bold';
        advertencia.textContent =
            'Advertencia: la selección supera la capacidad del vehículo.';
        lista.appendChild(advertencia);
    }

    if (volumenesPendientes > 0) {
        const advertencia = document.createElement('li');
        advertencia.className = 'text-warning-emphasis';
        advertencia.textContent =
            `${volumenesPendientes} proveedor(es) sin volumen evaluado. ` +
            'La ocupación calculada es parcial.';
        lista.appendChild(advertencia);
    }
}

// BOTÓN LIMPIAR

document.getElementById('btn-limpiar-ruta')
    .addEventListener('click', () => {
        proveedoresSeleccionados.clear();

        document.querySelectorAll('.checkbox-ruta')
            .forEach(checkbox => {
                checkbox.checked = false;
            });

        actualizarPanelRuta();
        mostrarMarcadores(establecimientosVisibles, false);
    });

// BOTÓN VER SELECCIÓN EN MAPA

document.getElementById('btn-ver-seleccion')
    .addEventListener('click', () => {
        const proveedores = Array.from(
            proveedoresSeleccionados.values()
        );

        if (proveedores.length === 0) {
            alert('Selecciona al menos un proveedor.');
            return;
        }

        const coordenadas = proveedores
            .filter(proveedor => {
                const lat = Number(proveedor.latitud);
                const lng = Number(proveedor.longitud);

                return proveedor.latitud !== null &&
                    proveedor.longitud !== null &&
                    proveedor.latitud !== undefined &&
                    proveedor.longitud !== undefined &&
                    Number.isFinite(lat) &&
                    Number.isFinite(lng) &&
                    lat >= -90 && lat <= 90 &&
                    lng >= -180 && lng <= 180;
            })
            .map(proveedor => [
                Number(proveedor.latitud),
                Number(proveedor.longitud)
            ]);

        if (coordenadas.length === 0) {
            alert(
                'Los proveedores seleccionados no tienen coordenadas válidas.'
            );
            return;
        }

        document.getElementById('mapa').scrollIntoView({
            behavior: 'smooth',
            block: 'start'
        });

        setTimeout(() => {
            mapa.invalidateSize();

            if (coordenadas.length === 1) {
                mapa.setView(coordenadas[0], 16);
            } else {
                mapa.fitBounds(coordenadas, {
                    padding: [60, 60],
                    maxZoom: 16
                });
            }
        }, 350);
    });

// INICIAR APLICACIÓN

cargarEstablecimientos();

console.log('BIOGIRO: aplicación inicializada correctamente.');
