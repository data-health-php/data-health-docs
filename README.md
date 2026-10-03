# Data Health Documentation

This Starlight site documents Data Health, a Laravel package for detecting data inconsistencies, tracking each occurrence, and verifying or resolving the underlying problem.

The documentation covers both Composer packages:

- `data-health/data-health` — finding discovery, persistence, lifecycle operations, scheduling, queues, and model integration.
- `data-health/data-health-filament` — the optional Filament 5 operator interface.

## Requirements

- Node.js supported by the installed Astro version
- npm

The package requirements described by the site are PHP 8.3 or newer and Laravel 12 or 13. The optional interface requires Filament 5.

## Local development

Install dependencies:

```bash
npm install
```

Start Astro's background development server:

```bash
npm run astro -- dev --background
```

Inspect or stop it with:

```bash
npm run astro -- dev status
npm run astro -- dev logs
npm run astro -- dev stop
```

Build the production site before submitting documentation changes:

```bash
npm run build
```

## Content structure

Documentation pages live in `src/content/docs` and are organized as:

- `start-here` — installation and the first end-to-end workflow;
- `core-concepts` — finding identity, records, lifecycle, and discovery;
- `guides` — development and operational workflows;
- `filament` — optional interface installation, authorization, and features; and
- `reference` — configuration, public APIs, database schema, and troubleshooting.

The sidebar order is defined in `astro.config.mjs`. When adding or renaming a page, update the sidebar and verify every internal link in the production build.

## Writing conventions

- Document observable package behavior and public extension points.
- Keep examples aligned with the current package namespaces and Composer names.
- Use stable, internally consistent example keys and context schemas.
- State important compatibility limitations near installation steps, not only in reference pages.
- Prefer focused examples and link to deeper guides instead of repeating large implementations.

This repository contains documentation source only. Package behavior should be changed and tested in the corresponding Laravel package repository before its documentation is updated here.
