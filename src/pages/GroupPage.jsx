import { countLabel } from '../utils/wording.js';
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import * as groups from '../api/groups.js';
import GroupExpenses from '../features/expenses/GroupExpenses.jsx';
import { useGroupResource, ResourceState } from '../features/groups/resources.jsx';
import GroupAvatar from '../components/GroupAvatar.jsx';
import GroupMenu from '../features/groups/GroupMenu.jsx';
import Icon from '../components/Icon.jsx';

export default function GroupPage() {
  const { groupId } = useParams();
  const [params, setParams] = useSearchParams();
  const resource = useGroupResource((signal) => groups.getGroup(groupId, signal), [groupId]);
  const group = resource.data?.group;
  const [settlementTarget, setSettlementTarget] = useState(null);
  return <div className="group-conversation">
    <ResourceState resource={resource}>
      {group && <>
        <header className="conversation-header"><Link className="btn btn-secondary" to="/dashboard" aria-label="Back to groups">←</Link><div className="group-heading"><Link className="group-settings-photo" to={`/groups/${groupId}/settings`} aria-label="Group settings" title="Group settings"><GroupAvatar group={group} size="md" decorative /></Link><div className="group-title"><h1 title={group.name}><Link className="group-settings-name" to={`/groups/${groupId}/settings`}>{group.name}</Link></h1>
        <Link to={`/groups/${groupId}/members`}>{countLabel(group.member_count, 'member')}</Link></div></div>
        <span className="group-header-actions" role="group" aria-label="Group actions">
        {group.my_role === 'admin' && <Link className="btn btn-secondary header-invite" aria-label="Invite members" title="Invite members" to={`/groups/${groupId}/members#invite-members`}><Icon name="user-plus" /><span className="desktop-action-label">Invite members</span><span className="mobile-action-label">Invite</span></Link>}
        <button type="button" className="btn btn-secondary discussion-trigger" aria-label="Group discussion" onClick={() => { const next = new URLSearchParams(params); next.delete('expense'); next.set('panel', 'discussion'); setParams(next); }}><Icon name="discussion" /><span className="mobile-action-label">Discussion</span></button>
        <span className="header-generation" ref={setSettlementTarget} />
        </span>
        <GroupMenu group={group} /></header>
        {group.my_role === 'admin' && group.member_count === 1 && <section className="group-welcome" aria-label="Welcome to your group"><div><h2>Your group is ready!</h2><p>Invite friends to split expenses together.</p></div><Link className="btn btn-primary" to={`/groups/${groupId}/members#invite-members`}><Icon name="user-plus" />Invite members</Link></section>}
        <GroupExpenses key={group.id} group={group} compact settlementTarget={settlementTarget} />
      </>}
    </ResourceState>
  </div>;
}
