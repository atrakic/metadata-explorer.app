// Utility functions
const utils = {
    linkify: str => typeof str === 'string' && /^https?:\/\/[^\s]+$/.test(str)
        ? `<a href="${str}" target="_blank" rel="noopener">${str}</a>` : str,

    decodeHtmlEntities: str => {
        if (typeof str !== 'string') return str;
        const textarea = document.createElement('textarea');
        textarea.innerHTML = str;
        return textarea.value;
    },

    isPrimitive: val => ['string', 'number', 'boolean'].includes(typeof val),
    isObject: val => typeof val === 'object' && val !== null,
    isJSONLD: obj => obj?.['@context'] || obj?.['@type']
};

// Data processing
class DataRenderer {
    static renderValue(val) {
        if (utils.isPrimitive(val)) {
            return utils.linkify(utils.decodeHtmlEntities(String(val)));
        }

        if (Array.isArray(val)) {
            if (val.length === 0) return '<i>(empty)</i>';

            if (val.every(utils.isPrimitive)) {
                return `<ul>${val.map(e => `<li>${utils.linkify(e)}</li>`).join('')}</ul>`;
            }

            if (val.every(utils.isObject)) {
                const keys = [...new Set(val.flatMap(Object.keys))];
                const rows = val.map(obj =>
                    `<tr>${keys.map(k => `<td>${this.renderValue(obj[k]) ?? ''}</td>`).join('')}</tr>`
                ).join('');
                return `<table class="json-sub-table"><thead><tr>${keys.map(k => `<th>${k}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>`;
            }

            return `<pre>${utils.decodeHtmlEntities(JSON.stringify(val, null, 2))}</pre>`;
        }

        if (utils.isObject(val)) {
            const rows = Object.entries(val)
                .map(([k, v]) => `<tr><td><b>${k}</b></td><td>${this.renderValue(v)}</td></tr>`)
                .join('');
            return `<table class="json-sub-table"><tbody>${rows}</tbody></table>`;
        }

        return '';
    }
}

// RDF converters
class RDFConverter {
    static prefixes = {
        schema: 'https://schema.org/',
        csvw: 'https://www.w3.org/ns/csvw#',
        foaf: 'http://xmlns.com/foaf/0.1/',
        dcat: 'http://www.w3.org/ns/dcat#',
        sh: 'http://www.w3.org/ns/shacl#',
        rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
        rdfs: 'http://www.w3.org/2000/01/rdf-schema#'
    };

    static toTurtle(data) {
        let turtle = Object.entries(this.prefixes)
            .map(([prefix, uri]) => `@prefix ${prefix}: <${uri}> .`)
            .join('\n') + '\n\n';

        const type = data['@type'] || 'Resource';
        const props = Object.entries(data)
            .filter(([key]) => !['@context', '@type'].includes(key))
            .map(([key, value]) => {
                const predicate = key.includes(':') ? key : `schema:${key}`;
                return `  ${predicate} ${this.formatValue(value, '  ')}`;
            });

        return turtle + `<> a schema:${type} ;\n${props.join(' ;\n')} .\n`;
    }

    static formatValue(value, indent = '') {
        const decoded = utils.decodeHtmlEntities(value);

        if (typeof value === 'string') {
            return /^https?:\/\//.test(decoded) ? `<${decoded}>` : `"${decoded.replace(/"/g, '\\"')}"`;
        }

        if (typeof value === 'number' || typeof value === 'boolean') return value;

        if (Array.isArray(value)) {
            if (value.length === 0) return '()';

            const items = value.map(v => this.formatValue(v, indent + '  '));
            return value.every(e => !utils.isObject(e))
                ? `(\n${indent}  ${items.join(' ')}\n${indent})`
                : items.join(` ,\n${indent}`);
        }

        if (utils.isObject(value)) {
            if (value['@type']) {
                const props = Object.entries(value)
                    .filter(([k]) => k !== '@type')
                    .map(([k, v]) => {
                        const pred = k.includes(':') ? k : `schema:${k}`;
                        return `${indent}  ${pred} ${this.formatValue(v, indent + '  ')}`;
                    });
                return `[\n${indent}  a schema:${value['@type']} ;\n${props.join(' ;\n')}\n${indent}]`;
            }

            return `"${utils.decodeHtmlEntities(JSON.stringify(value)).replace(/"/g, '\\"')}"`;
        }

        return '""';
    }

    static async toNQuads(data) {
        if (!window.jsonld) return 'jsonld.js not loaded!';
        try {
            return await window.jsonld.toRDF(data, { format: 'application/n-quads' });
        } catch (err) {
            return `Error converting: ${err}`;
        }
    }

    static toRDF(format, turtle) {
        if (!window.$rdf) return 'RDFLib not loaded!';

        const store = window.$rdf.graph();
        const mimeTypes = {
            rdfxml: 'application/rdf+xml',
            ntriples: 'application/n-triples'
        };

        try {
            window.$rdf.parse(turtle, store, 'http://example.org/', 'text/turtle');
            return window.$rdf.serialize(undefined, store, 'http://example.org/', mimeTypes[format]);
        } catch (e) {
            return `Error converting: ${e}`;
        }
    }
}

// Main application
class JSONLDExplorer {
    constructor() {
        this.data = null;
        this.currentFormat = 'table';
        this.cache = {};
        this.elements = {};

        this.init();
    }

    init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setup());
        } else {
            this.setup();
        }
    }

    setup() {
        // Cache DOM elements
        this.elements = {
            views: {
                table: document.getElementById('dataset-table'),
                turtle: document.getElementById('turtle-view'),
                rdfxml: document.getElementById('rdfxml-view'),
                ntriples: document.getElementById('ntriples-view'),
                nquads: document.getElementById('nquads-view')
            },
            buttons: {
                load: document.getElementById('load-data'),
                download: document.getElementById('download'),
                toggleTable: document.getElementById('toggle-table'),
                toggleTurtle: document.getElementById('toggle-turtle'),
                toggleRdfxml: document.getElementById('toggle-rdfxml'),
                toggleNtriples: document.getElementById('toggle-ntriples'),
                toggleNquads: document.getElementById('toggle-nquads')
            },
            urlInput: document.getElementById('data-url')
        };

        this.bindEvents();

        const defaultUrl = this.elements.urlInput?.value?.trim();
        if (defaultUrl) this.loadData(defaultUrl);
    }

    bindEvents() {
        const { buttons, urlInput } = this.elements;

        buttons.load.addEventListener('click', () => this.handleLoad());
        urlInput.addEventListener('keypress', e => e.key === 'Enter' && this.handleLoad());

        Object.entries({
            toggleTable: 'table',
            toggleTurtle: 'turtle',
            toggleRdfxml: 'rdfxml',
            toggleNtriples: 'ntriples',
            toggleNquads: 'nquads'
        }).forEach(([button, format]) => {
            buttons[button].addEventListener('click', () => this.showView(format));
        });

        buttons.download.addEventListener('click', () => this.download());
    }

    handleLoad() {
        const url = this.elements.urlInput.value.trim();
        if (url) this.loadData(url);
    }

    async loadData(url) {
        const { buttons, views } = this.elements;

        this.setLoadingState(true);

        try {
            const response = await fetch(url);
            const data = await response.json();

            this.data = utils.isJSONLD(data) ? data : this.wrapGenericData(data);
            this.cache = {};

            this.renderTable(data);
            this.updateButtonStates();
            this.setLoadingState(false);

        } catch (error) {
            views.table.textContent = 'Failed to load data! Check the URL and try again.';
            console.error(error);
            this.setLoadingState(false);
        }
    }

    wrapGenericData(data) {
        return {
            "@context": { "schema": "https://schema.org/" },
            "@type": "Resource",
            ...Object.fromEntries(
                Object.entries(data).filter(([k]) => !['@context', '@type'].includes(k))
            )
        };
    }

    renderTable(data) {
        const rows = Object.entries(data)
            .map(([key, val]) => `<tr><td>${key}</td><td>${DataRenderer.renderValue(val)}</td></tr>`)
            .join('');

        this.elements.views.table.innerHTML = `<table><thead><tr><th>Key</th><th>Value</th></tr></thead><tbody>${rows}</tbody></table>`;
        this.showView('table');
    }

    setLoadingState(isLoading) {
        const { buttons, views } = this.elements;

        buttons.load.disabled = isLoading;
        buttons.load.textContent = isLoading ? 'Loading...' : 'Load Data';
        buttons.download.style.display = 'none';

        if (isLoading) {
            views.table.innerHTML = 'Loading...';
            Object.values(views).forEach(view => view.style.display = 'none');
        }
    }

    updateButtonStates() {
        const { buttons } = this.elements;

        buttons.toggleTurtle.disabled = false;
        buttons.toggleRdfxml.disabled = !window.$rdf;
        buttons.toggleNtriples.disabled = !window.$rdf;
        buttons.toggleNquads.disabled = !window.jsonld;
    }

    async showView(format) {
        if (!this.data) return;

        // Hide all views
        Object.values(this.elements.views).forEach(view => view.style.display = 'none');

        this.currentFormat = format;
        this.elements.buttons.download.style.display = format === 'table' ? 'none' : 'inline-block';

        if (format === 'table') {
            this.elements.views.table.style.display = 'block';
            return;
        }

        const view = this.elements.views[format];
        let content = this.cache[format];

        if (!content) {
            content = await this.generateContent(format);
            this.cache[format] = content;
        }

        this.renderContent(view, content, format);
        view.style.display = 'block';
    }

    async generateContent(format) {
        const turtle = RDFConverter.toTurtle(this.data);

        switch (format) {
            case 'turtle': return turtle;
            case 'rdfxml': return RDFConverter.toRDF('rdfxml', turtle);
            case 'ntriples': return RDFConverter.toRDF('ntriples', turtle);
            case 'nquads': return await RDFConverter.toNQuads(this.data);
            default: return '';
        }
    }

    renderContent(view, content, format) {
        let pre = view.querySelector('pre');
        if (!pre) {
            pre = document.createElement('pre');
            view.innerHTML = '';
            view.appendChild(pre);
        }

        if (format === 'nquads' && content === this.cache.nquads && content.includes('Loading')) {
            // Handle async nquads loading
            this.handleAsyncNQuads(pre);
        } else {
            pre.textContent = content;
        }
    }

    async handleAsyncNQuads(pre) {
        pre.textContent = 'Loading...';
        try {
            const nquads = await RDFConverter.toNQuads(this.data);
            this.cache.nquads = nquads;
            if (this.currentFormat === 'nquads') {
                pre.textContent = nquads;
            }
        } catch (error) {
            const errorMsg = `Error converting: ${error}`;
            this.cache.nquads = errorMsg;
            if (this.currentFormat === 'nquads') {
                pre.textContent = errorMsg;
            }
        }
    }

    download() {
        const extensions = {
            turtle: 'ttl',
            rdfxml: 'rdf',
            ntriples: 'nt',
            nquads: 'nq'
        };

        const data = this.cache[this.currentFormat];
        const ext = extensions[this.currentFormat];

        if (!data || data.startsWith('Error') || data.includes('not loaded')) return;

        const blob = new Blob([data], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');

        Object.assign(a, {
            href: url,
            download: `export.${ext}`,
            style: { display: 'none' }
        });

        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}

// Initialize application
new JSONLDExplorer();