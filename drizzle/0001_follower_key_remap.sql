-- One-time DATA migration (not a schema change) to accompany the followers_*
-- achievement key renumbering, done by @HMRC.
--
-- Old catalog: followers_100 (bronze, ≥100) / followers_1000 (silver, ≥1000) / followers_10000 (gold, ≥10000)
-- New catalog: followers_20  (bronze, ≥20)  / followers_50   (silver, ≥50)   / followers_100   (gold, ≥100)
--

UPDATE user_achievements
SET achievement_key = 'followers_50'
WHERE achievement_key = 'followers_1000';

INSERT INTO user_achievements (user_id, achievement_key, unlocked_at, claimed_at)
SELECT user_id, 'followers_100', unlocked_at, claimed_at
FROM user_achievements
WHERE achievement_key = 'followers_10000'
ON CONFLICT (user_id, achievement_key) DO NOTHING;

DELETE FROM user_achievements WHERE achievement_key = 'followers_10000';

UPDATE users SET pinned_achievement_key = 'followers_50'
WHERE pinned_achievement_key = 'followers_1000';

UPDATE users SET pinned_achievement_key = 'followers_100'
WHERE pinned_achievement_key = 'followers_10000';