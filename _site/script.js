// Detect URLs in strings
function linkify(str) {
    if (typeof str === "string" && str.match(/^(https?:\/\/[^\s]+)$/)) {
        return `<a href="${str}" target="_blank" rel="noopener">${str}</a>`;
    }
    return str;
}

// Recursively create table for the data
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
            let subTable = `<table class="json-sub-table"><thead><tr>${allKeys.map(k => `<th>${k}</th>`).join('')
                }</tr></thead><tbody>`;
            val.forEach(obj => {
                subTable += '<tr>' +
                    allKeys.map(k => `<td>${renderValue(obj[k]) ?? ""}</td>`).join('') +
                    '</tr>';
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

// Fetch and render the JSON-LD data from the local file
let jsonldData = null;

function loadData(url) {
    const loadBtn = document.getElementById('load-data');
    const tableView = document.getElementById('dataset-table');
    const turtleView = document.getElementById('turtle-view');

    loadBtn.disabled = true;
    loadBtn.textContent = 'Loading...';
    tableView.innerHTML = 'Loading...';
    turtleView.style.display = 'none';
    document.getElementById('toggle-format').textContent = 'Show Turtle Format';

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
        })
        .catch(err => {
            tableView.textContent = 'Failed to load data! Check the URL and try again.';
            console.error(err);
            loadBtn.disabled = false;
            loadBtn.textContent = 'Load Data';
        });
}

// Load default data on page load
loadData('data.jsonld');

// Load button event listener
document.getElementById('load-data').addEventListener('click', function () {
    const url = document.getElementById('data-url').value.trim();
    if (url) {
        loadData(url);
    }
});

// Allow Enter key to load data
document.getElementById('data-url').addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
        const url = this.value.trim();
        if (url) {
            loadData(url);
        }
    }
});

// Convert JSON-LD to Turtle format
function jsonldToTurtle(data) {
    let turtle = '';
    const prefixes = {
        'schema': 'https://schema.org/',
        'csvw': 'https://www.w3.org/ns/csvw#'
    };

    // Add prefixes
    for (const [prefix, uri] of Object.entries(prefixes)) {
        turtle += `@prefix ${prefix}: <${uri}> .\n`;
    }
    turtle += '\n';

    // Main subject
    const type = data['@type'] || 'Resource';
    turtle += `<> a schema:${type} ;\n`;

    // Add properties
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

// Toggle button functionality
document.getElementById('toggle-format').addEventListener('click', function () {
    const tableView = document.getElementById('dataset-table');
    const turtleView = document.getElementById('turtle-view');
    const btn = this;

    if (turtleView.style.display === 'none' || turtleView.style.display === '') {
        // Show Turtle format
        if (jsonldData) {
            const turtleText = jsonldToTurtle(jsonldData);
            turtleView.innerHTML = `<pre>${turtleText}</pre>`;
        }
        turtleView.style.display = 'block';
        tableView.style.display = 'none';
        btn.textContent = 'Show Table Format';
    } else {
        // Show table format
        turtleView.style.display = 'none';
        tableView.style.display = 'block';
        btn.textContent = 'Show Turtle Format';
    }
});
