# Copilot Instructions for JSON-LD Explorer App

## Project Overview

This is a simple web application for exploring JSON-LD (JavaScript Object Notation for Linked Data) datasets. The app allows users to load JSON-LD data from URLs and view it in table or Turtle format.

## Technology Stack

- **Frontend**: Vanilla HTML, CSS, and JavaScript (no frameworks)
- **Deployment**: GitHub Pages via GitHub Actions
- **Data Format**: JSON-LD (JavaScript Object Notation for Linked Data)

## Project Structure

```
├── _site/                  # Static site files served by GitHub Pages
│   ├── index.html          # Main HTML page
│   ├── script.js           # Application JavaScript logic
│   └── styles.css          # CSS styles
├── data/                   # Sample JSON-LD datasets
│   └── dataset.json        # Example earthquake dataset
├── .github/
│   └── workflows/
│       └── github-pages.yml # GitHub Pages deployment workflow
└── README.md
```

## Coding Conventions

### JavaScript
- Use vanilla JavaScript without external frameworks or libraries
- Use `const` and `let` instead of `var`
- Use arrow functions where appropriate
- Keep functions focused and single-purpose
- Handle errors with try/catch or Promise.catch()
- Use meaningful variable and function names

### CSS
- Use descriptive class names
- Organize styles logically (layout, components, utilities)
- Maintain consistent spacing and indentation
- Use responsive design principles

### HTML
- Use semantic HTML5 elements
- Include proper accessibility attributes
- Keep markup clean and well-structured

## Development Guidelines

1. **No build step required**: The `_site` folder contains all static files that are deployed directly
2. **Test locally**: Open `_site/index.html` in a browser to test changes
3. **JSON-LD data**: Sample data files are in the `data/` directory
4. **Deployment**: Push to main branch triggers automatic deployment to GitHub Pages

## Key Features to Maintain

- URL input for loading external JSON-LD data
- Table view for hierarchical data display
- Turtle format conversion toggle
- Linkification of URLs in the data
- Responsive design

## When Making Changes

- Keep the application framework-free (vanilla JS)
- Ensure backward compatibility with existing JSON-LD data formats
- Test both table and Turtle format rendering
- Verify responsive behavior on different screen sizes
