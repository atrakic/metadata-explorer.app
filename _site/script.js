function linkify(str) {
    if (typeof str === "string" && str.match(/^(https?:\/\/[^\s]+)$/)) {
        return `<a href="${str}" target="_blank" rel="noopener">${str}</a>`;
    }
    return str;
}

function renderValue(val) {
    if (typeof val === "string" || typeof val === "number" || typeof val === "boolean") {
        return linkify(String(val));
    } else if (Array.isArray(val)) {
        if (val.length === 0) return '<i>(empty)</i>';
        if (val.every(e => ["string", "number", "boolean"].includes(typeof e))) {
            return "<ul>" + val.map(e => `<li>${linkify(e)}</li>`).join("") + "</ul>";
        }
        else if (val.every(e => typeof e === "object" && e !== null)) {
            const allKeys = Array.from(new Set(val.flatMap(obj => Object.keys(obj))));
            let subTable = `<table class="json-sub-table"><thead><tr>${allKeys.map(k => `<th>${k}</th>`).join('')}</tr></thead><tbody>`;
            val.forEach(obj => {
                subTable += '<tr>' + allKeys.map(k => `<td>${renderValue(obj[k]) ?? ""}</td>`).join('') + '</tr>';
            });
            subTable += "</tbody></table>";
            return subTable;
        }
        return `<pre>${JSON.stringify(val, null, 2)}</pre>`;
    } else if (typeof val === "object" && val !== null) {
        let subTable = `<table class="json-sub-table"><tbody>`;
        for (const [k, v] of Object.entries(val)) {
            subTable += `<tr><td><b>${k}</b></td><td>${renderValue(v)}</td></tr>`;
        }
        subTable += "</tbody></table>";
        return subTable;
    } else {
        return '';
    }
}

let jsonldData = null;
let currentFormat = 'table';
let formatCache = {};

// Cached DOM element references for performance (initialized when DOM is ready)
let views = null;
let buttons = null;
let urlInput = null;

function initializeDOMReferences() {
    views = {
        table: document.getElementById('dataset-table'),
        turtle: document.getElementById('turtle-view'),
        rdfxml: document.getElementById('rdfxml-view'),
        ntriples: document.getElementById('ntriples-view'),
        nquads: document.getElementById('nquads-view')
    };
    buttons = {
        load: document.getElementById('load-data'),
        download: document.getElementById('download'),
        toggleTable: document.getElementById('toggle-table'),
        toggleTurtle: document.getElementById('toggle-turtle'),
        toggleRdfxml: document.getElementById('toggle-rdfxml'),
        toggleNtriples: document.getElementById('toggle-ntriples'),
        toggleNquads: document.getElementById('toggle-nquads')
    };
    urlInput = document.getElementById('data-url');

    // Setup event listeners after DOM references are cached
    buttons.load.addEventListener('click', function () {
        const url = urlInput.value.trim();
        if (url) {
            loadData(url);
        }
    });
    urlInput.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            const url = this.value.trim();
            if (url) {
                loadData(url);
            }
        }
    });
    buttons.toggleTable.addEventListener('click', function () {
        showView('table');
    });
    buttons.toggleTurtle.addEventListener('click', function () {
        showView('turtle');
    });
    buttons.toggleRdfxml.addEventListener('click', function () {
        showView('rdfxml');
    });
    buttons.toggleNtriples.addEventListener('click', function () {
        showView('ntriples');
    });
    buttons.toggleNquads.addEventListener('click', function () {
        showView('nquads');
    });
    buttons.download.addEventListener('click', function () {
        downloadCurrent();
    });
    buttons.load.addEventListener('click', function () {
        const url = urlInput.value.trim();
        if (url) {
            loadData(url);
        }
    });
    urlInput.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            const url = this.value.trim();
            if (url) {
                loadData(url);
            }
        }
    });
}

function isJSONLD(obj) {
    return obj && (obj['@context'] || obj['@type']);
}

// Default context/type for plain JSON
function genericLinkedData(obj) {
    const wrapped = {
        "@context": {
            "schema": "https://schema.org/"
        },
        "@type": "Resource"
    };
    // Add all properties except @context and @type to avoid conflicts
    for (const [key, value] of Object.entries(obj)) {
        if (key !== '@context' && key !== '@type') {
            wrapped[key] = value;
        }
    }
    return wrapped;
}

function loadData(url) {
    buttons.download.style.display = 'none';

    buttons.load.disabled = true;
    buttons.load.textContent = 'Loading...';
    views.table.innerHTML = 'Loading...';
    views.turtle.style.display = 'none';
    views.rdfxml.style.display = 'none';
    views.ntriples.style.display = 'none';
    views.nquads.style.display = 'none';

    fetch(url)
        .then(response => response.json())
        .then(data => {
            // If plain JSON, wrap with generic Linked Data semantics
            jsonldData = isJSONLD(data) ? data : genericLinkedData(data);
            formatCache = {};
            let html = '<table>';
            html += '<thead><tr><th>Key</th><th>Value</th></tr></thead><tbody>';
            Object.entries(data).forEach(([key, val]) => {
                html += `<tr><td>${key}</td><td>${renderValue(val)}</td></tr>`;
            });
            html += '</tbody></table>';
            views.table.innerHTML = html;
            buttons.load.disabled = false;
            buttons.load.textContent = 'Load Data';
            views.table.style.display = 'block';
            views.turtle.style.display = 'none';
            views.rdfxml.style.display = 'none';
            views.ntriples.style.display = 'none';
            views.nquads.style.display = 'none';
            currentFormat = 'table';
            buttons.download.style.display = 'none';
            // Always enable all toggles, since generic semantics are applied
            buttons.toggleTurtle.disabled = false;
            buttons.toggleRdfxml.disabled = false;
            buttons.toggleNtriples.disabled = false;
            buttons.toggleNquads.disabled = false;
        })
        .catch(err => {
            views.table.textContent = 'Failed to load data! Check the URL and try again.';
            console.error(err);
            buttons.load.disabled = false;
            buttons.load.textContent = 'Load Data';
        });
}

function jsonldToTurtle(data) {
    let turtle = '';
    const prefixes = {
        'schema': 'https://schema.org/',
        'csvw': 'https://www.w3.org/ns/csvw#'
    };
    for (const [prefix, uri] of Object.entries(prefixes)) {
        turtle += `@prefix ${prefix}: <${uri}> .\n`;
    }
    turtle += '\n';
    const type = data['@type'] || 'Resource';
    turtle += `<> a schema:${type} ;\n`;
    const props = [];
    for (const [key, value] of Object.entries(data)) {
        if (key === '@context' || key === '@type') continue;
        const predicate = key.includes(':') ? key : `schema:${key}`;
        const valueStr = formatTurtleValue(value, '  ');
        props.push(`  ${predicate} ${valueStr}`);
    }
    turtle += props.join(' ;\n') + ' .\n';
    return turtle;
}

function formatTurtleValue(value, indent = '') {
    if (typeof value === 'string') {
        if (value.startsWith('http://') || value.startsWith('https://')) {
            return `<${value}>`;
        }
        return `"${value.replace(/"/g, '\\"')}"`;
    } else if (typeof value === 'number') {
        return value;
    } else if (typeof value === 'boolean') {
        return value;
    } else if (Array.isArray(value)) {
        if (value.length === 0) return '()';
        const items = value.map(v => formatTurtleValue(v, indent + '  ')).join(',\n' + indent + '  ');
        return `(\n${indent}  ${items}\n${indent})`;
    } else if (typeof value === 'object' && value !== null) {
        if (value['@type']) {
            let result = `[\n${indent}  a schema:${value['@type']}`;
            for (const [k, v] of Object.entries(value)) {
                if (k === '@type') continue;
                const pred = k.includes(':') ? k : `schema:${k}`;
                result += ` ;\n${indent}  ${pred} ${formatTurtleValue(v, indent + '  ')}`;
            }
            result += `\n${indent}]`;
            return result;
        }
        return JSON.stringify(value);
    }
    return '""';
}

// RDFLib conversion
function turtleToRDF(format) {
    if (!window.$rdf) {
        return 'RDFLib not loaded!';
    }
    const $rdf = window.$rdf;
    const store = $rdf.graph();
    const turtle = jsonldToTurtle(jsonldData);
    try {
        $rdf.parse(turtle, store, 'http://example.org/', 'text/turtle');
        let mime = null;
        switch(format) {
            case 'rdfxml':
                mime = 'application/rdf+xml';
                break;
            case 'ntriples':
                mime = 'application/n-triples';
                break;
            default:
                return '';
        }
        return $rdf.serialize(undefined, store, 'http://example.org/', mime);
    } catch (e) {
        return `Error converting: ${e}`;
    }
}

// JSONLD.js: JSON-LD to N-Quads
function jsonldToNQuads(data) {
    if (!window.jsonld) {
        return Promise.resolve('jsonld.js not loaded!');
    }
    return window.jsonld.toRDF(data, { format: 'application/n-quads' })
        .then(nquads => nquads)
        .catch(err => `Error converting: ${err}`);
}

function showView(format) {
    if (!jsonldData) return;
    views.table.style.display = 'none';
    views.turtle.style.display = 'none';
    views.rdfxml.style.display = 'none';
    views.ntriples.style.display = 'none';
    views.nquads.style.display = 'none';

    buttons.download.style.display = format === 'table' ? 'none' : 'inline-block';
    currentFormat = format;

    if (format === 'table') {
        views.table.style.display = 'block';
    } else if (format === 'turtle') {
        if (!formatCache.turtle) formatCache.turtle = jsonldToTurtle(jsonldData);
        const turtlePre = views.turtle.querySelector('pre') || document.createElement('pre');
        turtlePre.textContent = formatCache.turtle;
        if (!views.turtle.contains(turtlePre)) {
            views.turtle.innerHTML = '';
            views.turtle.appendChild(turtlePre);
        }
        views.turtle.style.display = 'block';
    } else if (format === 'rdfxml') {
        if (!formatCache.rdfxml) formatCache.rdfxml = turtleToRDF('rdfxml');
        const rdfxmlPre = views.rdfxml.querySelector('pre') || document.createElement('pre');
        rdfxmlPre.textContent = formatCache.rdfxml;
        if (!views.rdfxml.contains(rdfxmlPre)) {
            views.rdfxml.innerHTML = '';
            views.rdfxml.appendChild(rdfxmlPre);
        }
        views.rdfxml.style.display = 'block';
    } else if (format === 'ntriples') {
        if (!formatCache.ntriples) formatCache.ntriples = turtleToRDF('ntriples');
        const ntriplesPre = views.ntriples.querySelector('pre') || document.createElement('pre');
        ntriplesPre.textContent = formatCache.ntriples;
        if (!views.ntriples.contains(ntriplesPre)) {
            views.ntriples.innerHTML = '';
            views.ntriples.appendChild(ntriplesPre);
        }
        views.ntriples.style.display = 'block';
    } else if (format === 'nquads') {
        const nquadsPre = views.nquads.querySelector('pre') || document.createElement('pre');
        if (!views.nquads.contains(nquadsPre)) {
            views.nquads.innerHTML = '';
            views.nquads.appendChild(nquadsPre);
        }
        if (formatCache.nquads) {
            nquadsPre.textContent = formatCache.nquads;
        } else {
            nquadsPre.textContent = 'Loading...';
            jsonldToNQuads(jsonldData)
                .then(nquads => {
                    formatCache.nquads = nquads;
                    // Only update if still on nquads view to prevent visual glitches
                    if (currentFormat === 'nquads') {
                        nquadsPre.textContent = nquads;
                    }
                })
                .catch(err => {
                    const errorMsg = `Error converting: ${err}`;
                    formatCache.nquads = errorMsg;
                    if (currentFormat === 'nquads') {
                        nquadsPre.textContent = errorMsg;
                    }
                });
        }
        views.nquads.style.display = 'block';
    }
}

function downloadCurrent() {
    let data = '';
    let ext = '';
    if (currentFormat === 'turtle') {
        data = formatCache.turtle;
        ext = 'ttl';
    } else if (currentFormat === 'rdfxml') {
        data = formatCache.rdfxml;
        ext = 'rdf';
    } else if (currentFormat === 'ntriples') {
        data = formatCache.ntriples;
        ext = 'nt';
    } else if (currentFormat === 'nquads') {
        // Don't download if data is still loading or is an error message
        if (formatCache.nquads && !formatCache.nquads.startsWith('Error') && !formatCache.nquads.startsWith('jsonld.js')) {
            data = formatCache.nquads;
        }
        ext = 'nq';
    }
    if (!data) return;
    const blob = new Blob([data], {type: "text/plain"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `export.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function initializeApp() {
    initializeDOMReferences();
    const defaultUrl = urlInput ? urlInput.value.trim() : '';
    if (defaultUrl) {
        loadData(defaultUrl);
    }
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}