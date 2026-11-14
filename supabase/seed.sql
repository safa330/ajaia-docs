-- Demo content. Run in the Supabase SQL editor AFTER creating the three demo users
-- (alice@hotmail.com, bob@hotmail.com, carol@hotmail.com) under Authentication -> Users.
-- Creating a user fires on_auth_user_created, which creates the matching profile row.

update public.profiles
set display_name = initcap(split_part(email, '@', 1))
where email in ('alice@hotmail.com', 'bob@hotmail.com', 'carol@hotmail.com');

-- Alice owns a plan and shares it with Bob as an editor.
with alice as (select id from public.profiles where email = 'alice@hotmail.com'),
     bob as (select id from public.profiles where email = 'bob@hotmail.com'),
     doc as (
       insert into public.documents (owner_id, title, content)
       select alice.id, 'Q4 launch plan', '{"type":"doc","content":[
         {"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":"Q4 launch plan"}]},
         {"type":"paragraph","content":[{"type":"text","text":"Owned by Alice and shared with Bob as an "},{"type":"text","marks":[{"type":"bold"}],"text":"editor"},{"type":"text","text":". Sign in as Bob to edit it."}]},
         {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Open items"}]},
         {"type":"bulletList","content":[
           {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Finalize pricing"}]}]},
           {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"underline"}],"text":"Draft the announcement"}]}]}
         ]},
         {"type":"orderedList","attrs":{"start":1},"content":[
           {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Internal review"}]}]},
           {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"italic"}],"text":"Customer beta"}]}]}
         ]}
       ]}'::jsonb
       from alice
       returning id
     )
insert into public.document_shares (document_id, user_id, role)
select doc.id, bob.id, 'editor' from doc, bob;

-- Bob owns meeting notes and shares them with Alice as a viewer (read-only).
with alice as (select id from public.profiles where email = 'alice@hotmail.com'),
     bob as (select id from public.profiles where email = 'bob@hotmail.com'),
     doc as (
       insert into public.documents (owner_id, title, content)
       select bob.id, 'Weekly sync notes', '{"type":"doc","content":[
         {"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":"Weekly sync notes"}]},
         {"type":"paragraph","content":[{"type":"text","text":"Owned by Bob and shared with Alice as a "},{"type":"text","marks":[{"type":"bold"}],"text":"viewer"},{"type":"text","text":". Alice can read this but not change it."}]}
       ]}'::jsonb
       from bob
       returning id
     )
insert into public.document_shares (document_id, user_id, role)
select doc.id, alice.id, 'viewer' from doc, alice;

-- Carol starts with no documents, which is useful for testing sharing from scratch.
