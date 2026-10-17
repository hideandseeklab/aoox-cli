import {expect} from 'chai'

import {
  bumpHint,
  describeOrigin,
  imageNameFromFolder,
  imageNameFromManifest,
  ImageSourceError,
  resolveImageSource,
  type SourceEnv,
  tagFromVersion,
} from '../../src/lib/image-source.js'
import {
  parseCargoToml,
  parseComposerJson,
  parseCsproj,
  parsePackageJson,
  parsePom,
  parsePubspec,
  parsePyproject,
} from '../../src/lib/manifest-parsers.js'

function env(files: Record<string, string>, extra: {describe?: null | string; dirName?: string; exact?: null | string} = {}): SourceEnv {
  return {
    dirName: extra.dirName ?? 'My Project',
    files: Object.keys(files),
    git: {describe: () => extra.describe ?? null, exactTag: () => extra.exact ?? null},
    read: (f) => files[f] ?? null,
  }
}

function lines(fn: () => unknown): string[] {
  try {
    fn()
  } catch (error) {
    if (error instanceof ImageSourceError) return error.lines
    throw error
  }

  throw new Error('did not throw')
}

describe('image source', () => {
describe('manifest parsers', () => {
  it('package.json / composer.json', () => {
    expect(parsePackageJson('{"name":"@acme/web","version":"1.4.2"}')).to.deep.equal({name: '@acme/web', version: '1.4.2'})
    expect(parseComposerJson('{"name":"acme/shop"}')).to.deep.equal({name: 'acme/shop', version: undefined})
    expect(parsePackageJson('{nope').note).to.contain('not valid JSON')
    expect(parsePackageJson('[]').note).to.contain('not a JSON object')
  })

  it('pyproject.toml: [project], poetry, dynamic version', () => {
    expect(parsePyproject('[project]\nname = "my-api"\nversion = "2.0.1"\n')).to.deep.equal({name: 'my-api', version: '2.0.1'})
    expect(parsePyproject("[tool.poetry]\nname = 'pet'\nversion = '0.3.0'\n")).to.deep.equal({name: 'pet', version: '0.3.0'})
    const dyn = parsePyproject('[project]\nname = "x"\ndynamic = ["version"]\n[tool.poetry]\nversion = "9.9.9"\n')
    expect(dyn).to.deep.equal({name: 'x', version: undefined})
    expect(parsePyproject('[project]\nname = "x"\n\n[project.urls]\nversion = "no"\n').version).to.equal(undefined)
  })

  it('Cargo.toml: package section, workspace version is missing', () => {
    expect(parseCargoToml('[package]\nname = "tool"\nversion = "0.1.0-alpha.1" # c\n[dependencies]\nname = "x"\n')).to.deep.equal({
      name: 'tool',
      version: '0.1.0-alpha.1',
    })
    expect(parseCargoToml('[package]\nname = "t"\nversion.workspace = true\n').version).to.equal(undefined)
    expect(parseCargoToml('[package]\nname = "t"\nversion = { workspace = true }\n').version).to.equal(undefined)
  })

  it('pubspec.yaml: top-level keys only', () => {
    expect(parsePubspec('name: my_app # x\nversion: 1.2.3+4\nenvironment:\n  name: nope\n')).to.deep.equal({
      name: 'my_app',
      version: '1.2.3+4',
    })
    expect(parsePubspec('name: "quoted"\nversion: \'1.0.0\'\n')).to.deep.equal({name: 'quoted', version: '1.0.0'})
  })

  it('csproj: AssemblyName/file name, Version/prefix+suffix, MSBuild variables are missing', () => {
    expect(parseCsproj('<Project><PropertyGroup><AssemblyName>Api</AssemblyName><Version>1.2.3</Version></PropertyGroup></Project>', 'x.csproj')).to.deep.equal({
      name: 'Api',
      version: '1.2.3',
    })
    expect(parseCsproj('<Project><!-- <Version>9</Version> --><VersionPrefix>1.0.0</VersionPrefix><VersionSuffix>beta</VersionSuffix></Project>', 'Web.csproj')).to.deep.equal({
      name: 'Web',
      version: '1.0.0-beta',
    })
    expect(parseCsproj('<Project><Version>$(Base).1</Version><AssemblyName>$(X)</AssemblyName></Project>', 'App.csproj')).to.deep.equal({
      name: 'App',
      version: undefined,
    })
  })

  it('pom.xml: root children only, not parent/dependencies, variables missing', () => {
    const pom = `<?xml version="1.0"?>
<project>
  <!-- <artifactId>commented</artifactId> -->
  <parent><artifactId>parent</artifactId><version>9.9.9</version></parent>
  <artifactId>service</artifactId>
  <version>3.1.0</version>
  <dependencies><dependency><artifactId>lib</artifactId><version>1</version></dependency></dependencies>
</project>`
    expect(parsePom(pom)).to.deep.equal({name: 'service', version: '3.1.0'})
    // eslint-disable-next-line no-template-curly-in-string
    expect(parsePom('<project><artifactId>a</artifactId><version>${revision}</version></project>')).to.deep.equal({
      name: 'a',
      version: undefined,
    })
    expect(parsePom('<project><parent><version>1</version></parent><artifactId>a</artifactId></project>').version).to.equal(undefined)
  })
})

describe('helpers', () => {
  it('names', () => {
    expect(imageNameFromManifest('@acme/web')).to.equal('web')
    expect(imageNameFromManifest('Vendor/Pkg')).to.equal('pkg')
    expect(imageNameFromFolder('My Project_v2!')).to.equal('my-project_v2')
    expect(imageNameFromFolder('___')).to.equal('')
  })

  it('"+" in versions', () => {
    expect(tagFromVersion('1.0.0+5')).to.deep.equal({changed: true, tag: '1.0.0_5'})
    expect(tagFromVersion('1.0.0')).to.deep.equal({changed: false, tag: '1.0.0'})
  })

  it('describeOrigin and bumpHint', () => {
    expect(describeOrigin({name: 'package.json', version: 'package.json'})).to.equal('name and version from package.json')
    expect(describeOrigin({name: 'folder', version: 'git tag v1'})).to.equal('name from folder, version from git tag v1')
    expect(describeOrigin({name: null, version: 'VERSION'})).to.equal('version from VERSION')
    expect(bumpHint('package.json', '1.0.1', 'a:1.0.1')).to.equal('Bump the version in package.json (e.g. 1.0.1), pass name:version (e.g. a:1.0.1)')
    expect(bumpHint('git tag v1', null, null)).to.equal('Tag a new release, pass name:version')
    expect(bumpHint(null, '1.0.1', 'a:1.0.1')).to.equal('Pick a new version (e.g. 1.0.1)')
  })
})

describe('resolveImageSource', () => {
  const pkg = JSON.stringify({name: '@acme/web', version: '1.4.2'})

  it('typed name:version wins and reads nothing', () => {
    const e = env({})
    e.read = () => {
      throw new Error('must not read')
    }

    expect(resolveImageSource('myapp:2.0.0', e)).to.deep.equal({notes: [], origin: {name: null, version: null}, raw: 'myapp:2.0.0'})
  })

  it('no argument: name and version from package.json', () => {
    const r = resolveImageSource(undefined, env({'package.json': pkg}))
    expect(r.raw).to.equal('web:1.4.2')
    expect(r.origin).to.deep.equal({name: 'package.json', version: 'package.json'})
  })

  it('name only: version from the project, host kept', () => {
    expect(resolveImageSource('myapp', env({'package.json': pkg})).raw).to.equal('myapp:1.4.2')
    expect(resolveImageSource('reg.example.com/a/b', env({'VERSION': '2.0.0\n'})).raw).to.equal('reg.example.com/a/b:2.0.0')
  })

  it('leaves invalid typed input for the normal parser', () => {
    expect(resolveImageSource('MyApp', env({})).raw).to.equal('MyApp')
  })

  it('order: first manifest with the value wins, names the file, mentions the others', () => {
    const r = resolveImageSource(
      undefined,
      env({'Cargo.toml': '[package]\nname="rs"\nversion="0.2.0"', 'package.json': pkg, 'pom.xml': '<project><artifactId>j</artifactId><version>1</version></project>'}),
    )
    expect(r.raw).to.equal('web:1.4.2')
    expect(r.notes[0]).to.contain('package.json, Cargo.toml, pom.xml')
  })

  it('a manifest without version falls through to later sources, per field', () => {
    const r = resolveImageSource(undefined, env({'composer.json': '{"name":"acme/shop"}', 'pubspec.yaml': 'name: x\nversion: 5.0.0+2'}))
    expect(r.raw).to.equal('shop:5.0.0_2')
    expect(r.origin).to.deep.equal({name: 'composer.json', version: 'pubspec.yaml'})
    expect(r.notes.some((n) => n.includes('replaced'))).to.equal(true)
  })

  it('two .csproj files are skipped with a note', () => {
    const out = lines(() => resolveImageSource(undefined, env({'A.csproj': '<Project/>', 'B.csproj': '<Project/>'}, {dirName: '!!'})))
    expect(out.some((l) => l.includes('2 .csproj files'))).to.equal(true)
  })

  it('VERSION file beats git; first non-empty line', () => {
    const r = resolveImageSource('app', env({VERSION: '\n  3.0.0  \nignored'}, {exact: 'v9.9.9'}))
    expect(r.raw).to.equal('app:3.0.0')
    expect(r.origin.version).to.equal('VERSION')
  })

  it('git exact tag: leading v stripped; name from folder', () => {
    const r = resolveImageSource(undefined, env({}, {dirName: 'My API', exact: 'v1.4.2'}))
    expect(r.raw).to.equal('my-api:1.4.2')
    expect(describeOrigin(r.origin)).to.equal('name from folder, version from git tag v1.4.2')
  })

  it('HEAD past a tag is refused, and with force uses describe output', () => {
    const e = env({}, {describe: 'v1.4.2-3-gabc123', dirName: 'api'})
    expect(lines(() => resolveImageSource(undefined, e))[1]).to.contain('git tag v1.0.0')
    const r = resolveImageSource(undefined, e, {force: true})
    expect(r.raw).to.equal('api:1.4.2-3-gabc123')
    expect(r.notes.join(' ')).to.contain('not exactly on a tag')
  })

  it('no git / no tags: skipped', () => {
    expect(lines(() => resolveImageSource('app', env({})))[0]).to.equal('A version is required: "app" has none.')
  })

  it('refuses an invalid manifest name or version, naming the file', () => {
    expect(lines(() => resolveImageSource(undefined, env({'package.json': '{"name":"a b","version":"1.0.0"}'})))[0]).to.contain('package.json')
    expect(lines(() => resolveImageSource('a', env({'package.json': '{"version":"-1"}'})))[0]).to.contain('not a valid image tag')
  })

  it('nothing found: current error plus the source list and skip notes', () => {
    const out = lines(() => resolveImageSource(undefined, env({'package.json': '{bad'}, {dirName: '!!'})))
    expect(out[0]).to.equal('An image name and version are required (name:version).')
    expect(out[1]).to.contain('pom.xml')
    expect(out[1]).to.contain('git tag')
    expect(out[2]).to.contain('not valid JSON')
  })
})
})
