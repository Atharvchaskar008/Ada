/**
 * File Classifier Service
 * Maps repository filepaths to technology domains to audit candidate contributions.
 */

export function classifyFile(filePath) {
  const normalized = filePath.toLowerCase().replace(/\\/g, '/');
  const fileName = normalized.split('/').pop();

  // Docker & Containerization
  if (
    fileName.startsWith('dockerfile') ||
    fileName.includes('docker-compose') ||
    fileName === 'compose.yaml' ||
    fileName === 'compose.yml' ||
    fileName === '.dockerignore' ||
    fileName.startsWith('containerfile')
  ) {
    return {
      domain: 'devops_docker',
      label: 'Docker & Containerization',
      color: '#38bdf8', // sky
      weight: 1.5,
    };
  }

  // Cloud, Kubernetes, CI/CD
  if (
    normalized.includes('.github/workflows/') ||
    normalized.includes('k8s/') ||
    fileName.endsWith('.k8s.yaml') ||
    fileName.endsWith('.k8s.yml') ||
    normalized.includes('helm/') ||
    fileName.endsWith('.tf') ||
    fileName === 'jenkinsfile'
  ) {
    return {
      domain: 'devops_ci_cloud',
      label: 'CI/CD & Cloud Infrastructure',
      color: '#0284c7', // blue
      weight: 1.5,
    };
  }

  // Database & Migrations
  if (
    normalized.includes('/migrations/') ||
    normalized.includes('/prisma/') ||
    fileName === 'schema.prisma' ||
    fileName.endsWith('.sql') ||
    fileName.endsWith('.surql')
  ) {
    return {
      domain: 'database',
      label: 'Database & Schemas',
      color: '#a855f7', // purple
      weight: 1.3,
    };
  }

  // Backend & System Logic
  if (
    (fileName.endsWith('.go') ||
      fileName.endsWith('.rs') ||
      fileName.endsWith('.py') ||
      fileName.endsWith('.java') ||
      fileName.endsWith('.rb') ||
      fileName.endsWith('.php') ||
      fileName.endsWith('.cs') ||
      fileName.endsWith('.c') ||
      fileName.endsWith('.cpp')) &&
    !normalized.includes('test')
  ) {
    return {
      domain: 'backend_api',
      label: 'Backend & Core Logic',
      color: '#10b981', // emerald
      weight: 1.4,
    };
  }

  // Node/TS/JS Backend Check
  if (
    (fileName.endsWith('.ts') || fileName.endsWith('.js')) &&
    (normalized.includes('/server/') ||
      normalized.includes('/backend/') ||
      normalized.includes('/controllers/') ||
      normalized.includes('/services/') ||
      normalized.includes('/routes/') ||
      normalized.includes('/api/') ||
      normalized.includes('/models/'))
  ) {
    return {
      domain: 'backend_api',
      label: 'Backend & Core Logic',
      color: '#10b981',
      weight: 1.4,
    };
  }

  // Frontend & UI Presentation
  if (
    fileName.endsWith('.html') ||
    fileName.endsWith('.css') ||
    fileName.endsWith('.scss') ||
    fileName.endsWith('.sass') ||
    fileName.endsWith('.less') ||
    fileName.endsWith('.jsx') ||
    fileName.endsWith('.tsx') ||
    fileName.endsWith('.vue') ||
    fileName.endsWith('.svelte') ||
    normalized.includes('/components/') ||
    normalized.includes('/views/') ||
    normalized.includes('/pages/') ||
    normalized.includes('/ui/')
  ) {
    return {
      domain: 'frontend_ui',
      label: 'Frontend UI & Styles',
      color: '#f59e0b', // amber
      weight: 1.0,
    };
  }

  // Tests
  if (
    normalized.includes('test') ||
    normalized.includes('spec') ||
    normalized.includes('__tests__')
  ) {
    return {
      domain: 'testing',
      label: 'Testing & QA',
      color: '#06b6d4',
      weight: 1.2,
    };
  }

  // Docs & Configuration
  if (
    fileName.endsWith('.md') ||
    fileName.endsWith('.txt') ||
    fileName.endsWith('.json') ||
    fileName.endsWith('.lock') ||
    fileName.endsWith('.yaml') ||
    fileName.endsWith('.yml') ||
    fileName.startsWith('.eslint') ||
    fileName.startsWith('.prettier') ||
    fileName === 'license'
  ) {
    return {
      domain: 'docs_config',
      label: 'Documentation & Config',
      color: '#64748b', // slate
      weight: 0.3,
    };
  }

  return {
    domain: 'general_code',
    label: 'General Code',
    color: '#94a3b8',
    weight: 1.0,
  };
}
