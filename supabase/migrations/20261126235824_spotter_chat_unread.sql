-- A private read position for each participant in a Spotter conversation.
create table spotter_private.chat_reads (
    connection_id uuid not null references spotter_private.connections(id) on delete cascade,
    reader_id uuid not null references spotter_private.profiles(user_id) on delete cascade,
    read_through timestamptz not null,
    primary key (connection_id, reader_id)
);

create index spotter_chat_reads_reader on spotter_private.chat_reads (reader_id);
create index spotter_unread_messages on spotter_private.messages (connection_id, sender_id, created_at);
alter table spotter_private.chat_reads enable row level security;
revoke all on spotter_private.chat_reads from public, anon, authenticated;

create function spotter_private.list_connections_with_unread() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
    actor uuid := spotter_private.active_account();
begin
    -- Reuse the authorized connection list and preserve its order and member payload.
    return coalesce((
        select jsonb_agg(entry.payload || jsonb_build_object(
            'unread_count', case when entry.payload ->> 'status' = 'accepted' then (
                select count(*)::integer
                from spotter_private.messages message
                where message.connection_id = (entry.payload ->> 'id')::uuid
                    and message.sender_id = (entry.payload #>> '{member,id}')::uuid
                    and message.created_at > coalesce(reads.read_through, '-infinity'::timestamptz)
                    and community_private.viewer_can_see_content('spotter_message', message.id::text)
            ) else 0 end
        ) order by entry.position)
        from jsonb_array_elements(spotter_private.list_connections()) with ordinality as entry(payload, position)
        left join spotter_private.chat_reads reads
            on reads.connection_id = (entry.payload ->> 'id')::uuid and reads.reader_id = actor
    ), '[]'::jsonb);
end;
$$;

create function spotter_private.mark_chat_read(p_connection_id uuid, p_message_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
    actor uuid := spotter_private.active_account();
    partner uuid := spotter_private.chat_partner(p_connection_id, actor);
    message_time timestamptz;
begin
    if partner is null or p_message_id is null then
        raise exception 'This conversation or message is unavailable.' using errcode = '42501';
    end if;
    perform spotter_private.lock_pair(actor, partner);
    perform spotter_private.active_account();
    perform spotter_private.require_chat(p_connection_id, actor);

    select message.created_at into message_time
    from spotter_private.messages message
    where message.id = p_message_id and message.connection_id = p_connection_id
        and message.sender_id = partner
        and community_private.viewer_can_see_content('spotter_message', message.id::text);
    if not found then
        raise exception 'This conversation or message is unavailable.' using errcode = '42501';
    end if;

    -- Replaying a cursor or reading from another device cannot move the position back.
    insert into spotter_private.chat_reads as reads (connection_id, reader_id, read_through)
    values (p_connection_id, actor, message_time)
    on conflict (connection_id, reader_id) do update
        set read_through = excluded.read_through
        where reads.read_through < excluded.read_through;
    return true;
end;
$$;

create or replace function public.spotter_connections() returns jsonb
language sql stable set search_path = '' as $$
    select spotter_private.list_connections_with_unread();
$$;

create function public.spotter_mark_chat_read(p_connection_id uuid, p_message_id uuid) returns boolean
language sql set search_path = '' as $$
    select spotter_private.mark_chat_read(p_connection_id, p_message_id);
$$;

revoke execute on function spotter_private.list_connections_with_unread(), spotter_private.mark_chat_read(uuid, uuid),
    public.spotter_mark_chat_read(uuid, uuid) from public, anon, authenticated;
grant execute on function spotter_private.list_connections_with_unread(), spotter_private.mark_chat_read(uuid, uuid),
    public.spotter_mark_chat_read(uuid, uuid) to authenticated;
