import type {CliConfig} from './config.js'
import type {Owner} from './env-command.js'
import type {LinkView} from './types.js'

import {api, ApiError} from './api.js'
import {EnvCommand} from './env-command.js'
import {describeLinks, type LinkList} from './variable-sets.js'

/** `aoox env link` / `unlink`: replace an owner's ordered link list and print the result. */
export abstract class LinkCommand extends EnvCommand {
  protected async replaceLinks(config: CliConfig, owner: Owner, links: LinkList): Promise<LinkView[]> {
    const base = owner.kind === 'compose' ? '/compose-apps' : '/applications'
    let saved: {links: LinkView[]}
    try {
      saved = await api<{links: LinkView[]}>(config, `${base}/${owner.id}/variable-sets`, {body: {links}, method: 'PUT'})
    } catch (error) {
      // 400: e.g. the set is not shared with the project; 403: a viewer, or a
      // protected environment that needs the project admin role.
      if (error instanceof ApiError && (error.status === 400 || error.status === 403)) this.fail(error.message)
      return this.failFromApi(error)
    }

    for (const line of describeLinks(owner.label, saved.links)) this.log(line)
    return saved.links
  }
}
