// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
	integrations: [
		starlight({
			title: 'Data Health',
			social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/data-health-php/data-health' }],
			sidebar: [
				{
					label: 'Start Here',
					items: [
						{ label: 'Introduction', slug: 'index' },
						{ label: 'Installation', slug: 'start-here/installation' },
						{ label: 'Quick Start', slug: 'start-here/quick-start' },
					],
				},
				{
					label: 'Core Concepts',
					items: [
						{ label: 'Findings and Records', slug: 'core-concepts/findings-and-records' },
						{ label: 'Finding Discovery', slug: 'core-concepts/finding-discovery' },
					],
				},
				{
					label: 'Guides',
					items: [
						{ label: 'Detecting Problems', slug: 'guides/detecting-problems' },
						{ label: 'Context', slug: 'guides/context' },
						{ label: 'Verifying Findings', slug: 'guides/verifying-findings' },
						{ label: 'Resolving Findings', slug: 'guides/resolving-findings' },
						{ label: 'Metadata and Worklists', slug: 'guides/metadata-and-worklists' },
					],
				},
				{
					label: 'Operations',
					items: [
						{ label: 'Scheduling and Queues', slug: 'guides/scheduling-and-queues' },
						{ label: 'Large Datasets', slug: 'guides/large-datasets' },
						{ label: 'Model Cleanup', slug: 'guides/model-cleanup' },
					],
				},
				{
					label: 'Filament Integration',
					items: [
						{ label: 'Overview', slug: 'filament/overview' },
						{ label: 'Installation', slug: 'filament/installation' },
						{ label: 'Authorization', slug: 'filament/authorization' },
						{ label: 'Managing Findings', slug: 'filament/managing-findings' },
						{ label: 'Finding Types and Detection', slug: 'filament/finding-types-and-detection' },
						{ label: 'Standalone Components', slug: 'filament/standalone-components' },
						{ label: 'Configuration and Model Links', slug: 'filament/configuration-and-model-links' },
					],
				},
				{
					label: 'Reference',
					items: [
						{ label: 'Configuration', slug: 'reference/configuration' },
						{ label: 'Attributes and Contracts', slug: 'reference/attributes-and-contracts' },
						{ label: 'Database Schema', slug: 'reference/database-schema' },
						{ label: 'Troubleshooting', slug: 'reference/troubleshooting' },
					],
				},
			],
		}),
	],
});
