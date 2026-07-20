import * as pulumi from '@pulumi/pulumi';
import * as gcp from '@pulumi/gcp';

const config = new pulumi.Config();
const project = gcp.config.project!;
const zone = config.get('zone') || 'us-central1-a';
const region = zone.replace(/-[a-z]$/, '');
const nodeCount = config.getNumber('nodeCount') || 2;

const registry = new gcp.artifactregistry.Repository('roundtrip-repo', {
  repositoryId: 'roundtrip',
  location: region,
  format: 'DOCKER',
  description: 'Container images for gcp-kubernetes-roundtrip',
});

const cluster = new gcp.container.Cluster('roundtrip-cluster', {
  name: 'roundtrip-cluster',
  location: zone,
  initialNodeCount: 1,
  removeDefaultNodePool: true,
  deletionProtection: false,
});

const nodePool = new gcp.container.NodePool('roundtrip-nodes', {
  name: 'roundtrip-nodes',
  cluster: cluster.name,
  location: zone,
  nodeCount: nodeCount,
  nodeConfig: {
    machineType: 'e2-medium',
    diskSizeGb: 30,
    oauthScopes: [
      'https://www.googleapis.com/auth/devstorage.read_only',
      'https://www.googleapis.com/auth/logging.write',
      'https://www.googleapis.com/auth/monitoring',
    ],
  },
  management: {
    autoRepair: true,
    autoUpgrade: true,
  },
});

const ciSa = new gcp.serviceaccount.Account('github-actions-sa', {
  accountId: 'github-actions',
  displayName: 'GitHub Actions CI/CD',
});

new gcp.artifactregistry.RepositoryIamMember('ci-ar-writer', {
  repository: registry.name,
  location: region,
  role: 'roles/artifactregistry.writer',
  member: pulumi.interpolate`serviceAccount:${ciSa.email}`,
});

new gcp.projects.IAMMember('ci-gke-developer', {
  project: project,
  role: 'roles/container.developer',
  member: pulumi.interpolate`serviceAccount:${ciSa.email}`,
});

const wifPool = new gcp.iam.WorkloadIdentityPool('github-pool', {
  workloadIdentityPoolId: 'github-actions-pool',
  displayName: 'GitHub Actions',
});

const wifProvider = new gcp.iam.WorkloadIdentityPoolProvider('github-provider', {
  workloadIdentityPoolId: wifPool.workloadIdentityPoolId,
  workloadIdentityPoolProviderId: 'github-provider',
  displayName: 'GitHub OIDC',
  attributeMapping: {
    'google.subject': 'assertion.sub',
    'attribute.actor': 'assertion.actor',
    'attribute.repository': 'assertion.repository',
  },
  oidc: {
    issuerUri: 'https://token.actions.githubusercontent.com',
  },
});

new gcp.serviceaccount.IAMMember('wif-sa-binding', {
  serviceAccountId: ciSa.name,
  role: 'roles/iam.workloadIdentityUser',
  member: pulumi.interpolate`principalSet://iam.googleapis.com/${wifPool.name}/attribute.repository/YOUR_GITHUB_ORG/gcp-kubernetes-roundtrip`,
});

export const clusterName = cluster.name;
export const clusterEndpoint = cluster.endpoint;
export const registryUrl = pulumi.interpolate`${region}-docker.pkg.dev/${project}/${registry.repositoryId}`;
export const wifProviderName = wifProvider.name;
export const ciServiceAccountEmail = ciSa.email;
