import { Link, useParams } from 'react-router-dom';
import { getGroup, updateGroup } from '../api/groups.js';
import { useState } from 'react';
import GroupForm from '../features/groups/GroupForm.jsx';
import GroupPhotoEditor from '../features/groups/GroupPhotoEditor.jsx';
import TransferAdmin from '../features/groups/TransferAdmin.jsx';
import { useGroupResource, ResourceState } from '../features/groups/resources.jsx';

export default function GroupSettingsPage() {
  const { groupId } = useParams();
  const resource = useGroupResource((signal) => getGroup(groupId, signal), [groupId]);
  const [updated, setUpdated] = useState(null);
  const group = updated?.id === groupId ? updated : resource.data?.group;
  return <div className="stack"><Link to={`/groups/${groupId}`}>Back to group</Link><h1>Group settings</h1>
    <ResourceState resource={resource}>{group && <section className="card stack"><h2>{group.name}</h2>
      <GroupPhotoEditor key={group.id} group={group} onSaved={setUpdated} />
      <h3>Group details</h3>
      <GroupForm key={group.name + group.description} group={group} onSave={(body) => updateGroup(groupId, body)} onSaved={setUpdated} />
      {group.my_role === 'admin' && <TransferAdmin group={group} onSaved={setUpdated} />}
    </section>}</ResourceState>
  </div>;
}
