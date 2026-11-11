-- Run only together with deploying backup/pre-30-categories-20261110.
-- Retains the v2 bank as an additional recovery checkpoint.
INSERT OR IGNORE INTO question_bank_versions(version,payload,revision,saved_at)
SELECT 'catalog-v2-before-rollback',payload,revision,datetime('now') FROM question_bank WHERE id=1;
UPDATE question_bank SET payload=(SELECT payload FROM question_bank_versions WHERE version='pre-catalog-v2'),revision=revision+1
WHERE id=1 AND EXISTS(SELECT 1 FROM question_bank_versions WHERE version='pre-catalog-v2');
UPDATE game_rooms SET status=CASE WHEN json_extract(state_json,'$.phase')='FINISHED' THEN 'finished' WHEN state_json='null' THEN 'waiting' ELSE 'playing' END,
deadline=json_extract(state_json,'$.deadline') WHERE schema_version=1;
