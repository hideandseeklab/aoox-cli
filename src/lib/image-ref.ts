/**
 * Mirrors `slugPart()` in aoox-api's `deployment-runner.service.ts`
 * exactly (repo name = `<slug(project.name)>/<appName>`), so an image built
 * here lands at the same path the API's own build would have used.
 */
export function slugPart(s: string): string {
  return (
    s
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, '-')
      .replaceAll(/^-+|-+$/g, '')
      .slice(0, 40) || 'project'
  )
}

export function imageRefFor(options: {appName: string; projectName: string; registryUrl: string; tag: string}): string {
  const {appName, projectName, registryUrl, tag} = options
  return `${registryUrl}/${slugPart(projectName)}/${appName}:${tag}`
}
