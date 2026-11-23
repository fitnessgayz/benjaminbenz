# GRUNTR Community moderation

Community reports and shared-profile-photo reviews are available to production database operators. They are private. Use the project’s authenticated SQL editor or an approved service-side integration. Never expose service credentials or report data to client apps.

Review new reports promptly and handle urgent reports sent to `fwb@benjaminbenz.com` through the same process. The first query only returns pending cases, including the reported excerpt. The case ID identifies the item to resolve. Keep report details and screenshots in the authorized workspace.

```sql
select id, content_kind, content_id, reason, details, content_excerpt, created_at
from community_private.content_reports
where reviewed_at is null
order by created_at
limit 50;
```

After reviewing a case, call `public.resolve_community_content_report(case_id, true)` to hide the content or `public.resolve_community_content_report(case_id, false)` to close the report without hiding it. Users' own blocks take effect independently of the report decision.

```sql
select member_id, photo_path, submitted_at
from community_private.avatar_reviews
where decided_at is null
order by submitted_at
limit 50;
```

Review the exact file in the private `community-avatars` bucket. Call `public.resolve_community_avatar_review(member_id, photo_path, true)` if it can be shared, or use `false` to deny sharing. Other members see the existing emoji fallback while review is pending or if a photo is denied.

Deploy the moderation migration before distributing the iOS build that calls it. Verify reporting, blocking, unblocking and avatar approval with synthetic accounts in a non-production environment before enabling the release.
