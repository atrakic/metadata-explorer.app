// --- Utility: Render values in HTML table ---
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

// --- App state ---
let jsonldData = null;

// --- Load JSON-LD and render table ---
function loadData(url) {
    console.log('URL argument received:', url);

    const loadBtn = document.getElementById('load-data');
    const tableView = document.getElementById('dataset-table');
    const turtleView = document.getElementById('turtle-view');
    const rdfxmlView = document.getElementById('rdfxml-view');
    loadBtn.disabled = true;
    loadBtn.textContent = 'Loading...';
    tableView.innerHTML = 'Loading...';
    turtleView.style.display = 'none';
    rdfxmlView.style.display = 'none';
    document.getElementById('toggle-format').textContent = 'Show Turtle Format';
    document.getElementById('toggle-rdfxml').textContent = 'Show RDF/XML Format';

    fetch(url)
        .then(response => response.json())
        .then(data => {
            jsonldData = data;
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
        })
        .catch(err => {
            tableView.textContent = 'Failed to load data! Check the URL and try again.';
            console.error(err);
            loadBtn.disabled = false;
            loadBtn.textContent = 'Load Data';
        });
}

// --- On page load, if a default URL is present ---
function initializeApp() {
    const urlInput = document.getElementById('data-url');
    const defaultUrl = urlInput ? urlInput.value.trim() : '';
    if (defaultUrl) {
        loadData(defaultUrl);
    }
}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}

// --- Load button event listener ---
document.getElementById('load-data').addEventListener('click', function () {
    const url = document.getElementById('data-url').value.trim();
    if (url) {
        loadData(url);
    }
});

// --- Enter key triggers loading ---
document.getElementById('data-url').addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
        const url = this.value.trim();
        if (url) {
            loadData(url);
        }
    }
});

// --- JSON-LD to Turtle ---
function jsonldToTurtle(data) {
    let turtle = '';
    const prefixes = {
        'schema': 'https://schema.org/',
        'csvw': 'https://www.w3.org/ns/csvw#'
    };
    // Prefixes
    for (const [prefix, uri] of Object.entries(prefixes)) {
        turtle += `@prefix ${prefix}: <${uri}> .\n`;
    }
    turtle += '\n';
    // Main subject
    const type = data['@type'] || 'Resource';
    turtle += `<> a schema:${type} ;\n`;
    // Properties
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

// --- Format Turtle values ---
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

// --- Turtle to RDF/XML using rdflib.js ---
function turtleToRDFXML(turtleText) {
    if (!window.$rdf) {
        return 'RDFLib not loaded!';
    }
    const $rdf = window.$rdf;
    const store = $rdf.graph();
    try {
        $rdf.parse(turtleText, store, 'http://example.org/', 'text/turtle');
        return $rdf.serialize(undefined, store, 'http://example.org/', 'application/rdf+xml');
    } catch (e) {
        return `Error converting to RDF/XML: ${e}`;
    }
}

// --- Button: Toggle Turtle View ---
document.getElementById('toggle-format').addEventListener('click', function () {
    const tableView = document.getElementById('dataset-table');
    const turtleView = document.getElementById('turtle-view');
    const rdfxmlView = document.getElementById('rdfxml-view');
    const btn = this;

    if (turtleView.style.display === 'none' || turtleView.style.display === '') {
        // Show Turtle format
        if (jsonldData) {
            const turtleText = jsonldToTurtle(jsonldData);
            turtleView.innerHTML = `<pre>${turtleText}</pre>`;
        }
        turtleView.style.display = 'block';
        tableView.style.display = 'none';
        rdfxmlView.style.display = 'none';
        btn.textContent = 'Show Table Format';
        document.getElementById('toggle-rdfxml').textContent = 'Show RDF/XML Format';
    } else {
        // Show table format
        turtleView.style.display = 'none';
        rdfxmlView.style.display = 'none';
        tableView.style.display = 'block';
        btn.textContent = 'Show Turtle Format';
        document.getElementById('toggle-rdfxml').textContent = 'Show RDF/XML Format';
    }
});

// --- Button: Toggle RDF/XML View ---
document.getElementById('toggle-rdfxml').addEventListener('click', function () {
    const tableView = document.getElementById('dataset-table');
    const turtleView = document.getElementById('turtle-view');
    const rdfxmlView = document.getElementById('rdfxml-view');
    const btn = this;

    if (rdfxmlView.style.display === 'none' || rdfxmlView.style.display === '') {
        // Show RDF/XML format
        if (jsonldData) {
            const turtleText = jsonldToTurtle(jsonldData);
            const rdfxmlText = turtleToRDFXML(turtleText);
            rdfxmlView.innerHTML = `<pre>${rdfxmlText}</pre>`;
        }
        rdfxmlView.style.display = 'block';
        tableView.style.display = 'none';
        turtleView.style.display = 'none';
        btn.textContent = 'Show Table Format';
        document.getElementById('toggle-format').textContent = 'Show Turtle Format';
    } else {
        // Show table format
        rdfxmlView.style.display = 'none';
        turtleView.style.display = 'none';
        tableView.style.display = 'block';
        btn.textContent = 'Show RDF/XML Format';
        document.getElementById('toggle-format').textContent = 'Show Turtle Format';
    }
});