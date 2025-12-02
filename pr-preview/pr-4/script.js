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

function isJSONLD(obj) {
    return obj && (obj['@context'] || obj['@type']);
}

// Default context/type for plain JSON
function genericLinkedData(obj) {
    return {
        "@context": {
            "schema": "https://schema.org/"
        },
        "@type": "Resource",
        ...obj
    };
}

function loadData(url) {
    const loadBtn = document.getElementById('load-data');
    const tableView = document.getElementById('dataset-table');
    const turtleView = document.getElementById('turtle-view');
    const rdfxmlView = document.getElementById('rdfxml-view');
    const ntriplesView = document.getElementById('ntriples-view');
    const nquadsView = document.getElementById('nquads-view');
    document.getElementById('download').style.display = 'none';

    loadBtn.disabled = true;
    loadBtn.textContent = 'Loading...';
    tableView.innerHTML = 'Loading...';
    turtleView.style.display = 'none';
    rdfxmlView.style.display = 'none';
    ntriplesView.style.display = 'none';
    nquadsView.style.display = 'none';

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
            tableView.innerHTML = html;
            loadBtn.disabled = false;
            loadBtn.textContent = 'Load Data';
            tableView.style.display = 'block';
            turtleView.style.display = 'none';
            rdfxmlView.style.display = 'none';
            ntriplesView.style.display = 'none';
            nquadsView.style.display = 'none';
            currentFormat = 'table';
            document.getElementById('download').style.display = 'none';
            // Always enable all toggles, since generic semantics are applied
            ['toggle-turtle','toggle-rdfxml','toggle-ntriples','toggle-nquads'].forEach(id =>
                document.getElementById(id).disabled = false
            );
        })
        .catch(err => {
            tableView.textContent = 'Failed to load data! Check the URL and try again.';
            console.error(err);
            loadBtn.disabled = false;
            loadBtn.textContent = 'Load Data';
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
        return 'jsonld.js not loaded!';
    }
    window.jsonld.toRDF(data, { format: 'application/n-quads' })
        .then(nquads => {
            document.getElementById('nquads-view').innerHTML = `<pre>${nquads}</pre>`;
        })
        .catch(err => {
            document.getElementById('nquads-view').innerHTML = `<pre>Error converting: ${err}</pre>`;
        });
}

// UI Toggles
document.getElementById('toggle-table').addEventListener('click', function () {
    showView('table');
});
document.getElementById('toggle-turtle').addEventListener('click', function () {
    showView('turtle');
});
document.getElementById('toggle-rdfxml').addEventListener('click', function () {
    showView('rdfxml');
});
document.getElementById('toggle-ntriples').addEventListener('click', function () {
    showView('ntriples');
});
document.getElementById('toggle-nquads').addEventListener('click', function () {
    showView('nquads');
});
document.getElementById('download').addEventListener('click', function () {
    downloadCurrent();
});

function showView(format) {
    if (!jsonldData) return;
    document.getElementById('dataset-table').style.display = 'none';
    document.getElementById('turtle-view').style.display = 'none';
    document.getElementById('rdfxml-view').style.display = 'none';
    document.getElementById('ntriples-view').style.display = 'none';
    document.getElementById('nquads-view').style.display = 'none';

    document.getElementById('download').style.display = format === 'table' ? 'none' : 'inline-block';
    currentFormat = format;

    if (format === 'table') {
        document.getElementById('dataset-table').style.display = 'block';
    } else if (format === 'turtle') {
        if (!formatCache.turtle) formatCache.turtle = jsonldToTurtle(jsonldData);
        const turtlePre = document.getElementById('turtle-view').querySelector('pre') || document.createElement('pre');
        turtlePre.textContent = formatCache.turtle;
        if (!document.getElementById('turtle-view').contains(turtlePre)) {
            document.getElementById('turtle-view').innerHTML = '';
            document.getElementById('turtle-view').appendChild(turtlePre);
        }
        document.getElementById('turtle-view').style.display = 'block';
    } else if (format === 'rdfxml') {
        if (!formatCache.rdfxml) formatCache.rdfxml = turtleToRDF('rdfxml');
        const rdfxmlPre = document.getElementById('rdfxml-view').querySelector('pre') || document.createElement('pre');
        rdfxmlPre.textContent = formatCache.rdfxml;
        if (!document.getElementById('rdfxml-view').contains(rdfxmlPre)) {
            document.getElementById('rdfxml-view').innerHTML = '';
            document.getElementById('rdfxml-view').appendChild(rdfxmlPre);
        }
        document.getElementById('rdfxml-view').style.display = 'block';
    } else if (format === 'ntriples') {
        if (!formatCache.ntriples) formatCache.ntriples = turtleToRDF('ntriples');
        const ntriplesPre = document.getElementById('ntriples-view').querySelector('pre') || document.createElement('pre');
        ntriplesPre.textContent = formatCache.ntriples;
        if (!document.getElementById('ntriples-view').contains(ntriplesPre)) {
            document.getElementById('ntriples-view').innerHTML = '';
            document.getElementById('ntriples-view').appendChild(ntriplesPre);
        }
        document.getElementById('ntriples-view').style.display = 'block';
    } else if (format === 'nquads') {
        const nquadsPre = document.getElementById('nquads-view').querySelector('pre') || document.createElement('pre');
        nquadsPre.textContent = 'Loading...';
        if (!document.getElementById('nquads-view').contains(nquadsPre)) {
            document.getElementById('nquads-view').innerHTML = '';
            document.getElementById('nquads-view').appendChild(nquadsPre);
        }
        jsonldToNQuads(jsonldData);
        document.getElementById('nquads-view').style.display = 'block';
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
        data = document.getElementById('nquads-view').textContent;
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
    const urlInput = document.getElementById('data-url');
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