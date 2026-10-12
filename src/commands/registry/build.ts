import {Args, Flags} from '@oclif/core'

import {dockerInherit} from '../../lib/docker.js'
import {RegistryImageCommand, registryImageFlags} from '../../lib/registry-image-command.js'

/**
 * Builds ./Dockerfile into a local image named `<registry host>/<name>:<version>`
 * after checking that the version is not already in the registry. Pushing is
 * the separate `aoox registry push`; neither deploys anything.
 */
export default class RegistryBuild extends RegistryImageCommand {
  static args = {
    image: Args.string({description: 'Image name and version, e.g. myapp:1.0.0', required: true}),
  }
  static description =
    'Build an image from a Dockerfile, named for the aoox registry (refuses a version that already exists there)'
  static examples = [
    '<%= config.bin %> <%= command.id %> myapp:1.0.0',
    '<%= config.bin %> <%= command.id %> team/api:2.1.0 -f docker/Dockerfile --context .',
    '<%= config.bin %> <%= command.id %> myapp:1.0.0 --force',
  ]
  static flags = {
    ...registryImageFlags,
    context: Flags.string({default: '.', description: 'Docker build context'}),
    dockerfile: Flags.string({char: 'f', default: 'Dockerfile', description: 'Path to the Dockerfile'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(RegistryBuild)
    const image = await this.resolveImage(args.image, flags, 'aoox registry build myapp:1.0.0')

    await this.refuseExisting(image, {force: flags.force, verb: 'overwrite'})

    this.log(`==> Build ${image.fullRef}`)
    await dockerInherit(['build', '-t', image.fullRef, '-f', flags.dockerfile, flags.context], process.cwd())

    this.log(`Built ${image.fullRef}`)
    this.log(`Next: aoox registry push ${image.shortRef}`)
  }
}
