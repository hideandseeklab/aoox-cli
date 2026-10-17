import {Args, Flags} from '@oclif/core'

import {dockerInherit} from '../../lib/docker.js'
import {RegistryImageCommand, registryImageFlags} from '../../lib/registry-image-command.js'
import {hintLine, stepLine, successLine} from '../../lib/style.js'

/**
 * Builds ./Dockerfile into a local image named `<registry host>/<name>:<version>`
 * after checking that the version is not already in the registry. `--push`
 * pushes it right after (the same steps as `aoox registry push`); without it,
 * pushing is the separate `aoox registry push`. Neither deploys anything.
 * Without a name or version, they come from package.json in the context.
 */
export default class RegistryBuild extends RegistryImageCommand {
  static args = {
    image: Args.string({description:
        'Image name and version, e.g. myapp:1.0.0. Omit it (or the version) to read them from the project in the build context: package.json, pyproject.toml, Cargo.toml, composer.json, pubspec.yaml, *.csproj, pom.xml, a VERSION file or a git tag',
      required: false}),
  }
  static description =
    'Build an image from a Dockerfile, named for the aoox registry (refuses a version that already exists there). A name or version you leave out is taken from the project (you confirm it first, or pass --yes)'
  static examples = [
    '<%= config.bin %> <%= command.id %> myapp:1.0.0',
    '<%= config.bin %> <%= command.id %> --push',
    '<%= config.bin %> <%= command.id %> myapp --context ./app',
    '<%= config.bin %> <%= command.id %> --push --yes',
    '<%= config.bin %> <%= command.id %> myapp:1.0.0 --push',
    '<%= config.bin %> <%= command.id %> team/api:2.1.0 -f docker/Dockerfile --context .',
    '<%= config.bin %> <%= command.id %> myapp:1.0.0 --force',
  ]
  static flags = {
    ...registryImageFlags,
    context: Flags.string({default: '.', description: 'Docker build context'}),
    dockerfile: Flags.string({char: 'f', default: 'Dockerfile', description: 'Path to the Dockerfile'}),
    push: Flags.boolean({description: 'Push the image to the registry right after the build'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(RegistryBuild)
    const image = await this.resolveImage(args.image, flags, 'Build', flags.context)
    await this.requireDocker()

    await this.refuseExisting(image, {force: flags.force, verb: 'overwrite'})

    this.log(stepLine('Build', image.fullRef))
    await dockerInherit(['build', '-t', image.fullRef, '-f', flags.dockerfile, flags.context], process.cwd())

    this.log(successLine('Built', image.fullRef))
    if (flags.push) {
      // The version was already checked against the registry before the build.
      await this.pushImage(image)
      return
    }

    this.log(hintLine(`Next: aoox registry push ${image.shortRef} (or build with --push next time)`))
  }
}
