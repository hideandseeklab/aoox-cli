import {Args} from '@oclif/core'

import {dockerCapture} from '../../lib/docker.js'
import {RegistryImageCommand, registryImageFlags} from '../../lib/registry-image-command.js'

/**
 * Pushes an image that `aoox registry build` (or any `docker build`) already
 * made locally. Never builds and never deploys.
 */
export default class RegistryPush extends RegistryImageCommand {
  static args = {
    image: Args.string({description:
        'Image name and version (short or full), e.g. myapp:1.0.0. Omit it (or the version) to read them from the project in the current directory: package.json, pyproject.toml, Cargo.toml, composer.json, pubspec.yaml, *.csproj, pom.xml, a VERSION file or a git tag',
      required: false}),
  }
  static description =
    'Push a local image to the aoox registry (refuses a version that already exists there). A name or version you leave out is taken from the project (you confirm it first, or pass --yes)'
  static examples = [
    '<%= config.bin %> <%= command.id %> myapp:1.0.0',
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> myapp',
    '<%= config.bin %> <%= command.id %> registry.example.com/myapp:1.0.0',
    '<%= config.bin %> <%= command.id %> myapp:1.0.0 --force',
  ]
  static flags = {...registryImageFlags}

  async run(): Promise<void> {
    const {args, flags} = await this.parse(RegistryPush)
    const image = await this.resolveImage(args.image, flags, 'Push', '.')
    // Before the image check: with the engine down every image looks "missing".
    await this.requireDocker()

    const local = await dockerCapture(['image', 'inspect', '--format', '{{.Id}}', image.fullRef])
    if (!local) {
      this.fail(`No local image ${image.shortRef}.`, `Build it first: aoox registry build ${image.shortRef}`)
    }

    await this.refuseExisting(image, {force: flags.force, verb: 'overwrite'})
    await this.pushImage(image)
  }
}
