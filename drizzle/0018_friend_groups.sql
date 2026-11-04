CREATE TABLE friend_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name varchar(40) NOT NULL
);
CREATE UNIQUE INDEX friend_groups_owner_name_unique ON friend_groups(user_id, name);
CREATE TABLE friend_group_members (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  friendship_id uuid NOT NULL REFERENCES friendships(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES friend_groups(id) ON DELETE CASCADE,
  PRIMARY KEY(user_id, friendship_id)
);
