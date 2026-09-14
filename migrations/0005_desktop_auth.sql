CREATE TABLE desktop_auth_transactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    state_hash text NOT NULL UNIQUE,

    code_hash text UNIQUE,

    user_id text REFERENCES users(id) ON DELETE CASCADE,

    expires_at timestamp NOT NULL,

    consumed_at timestamp,

    created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX desktop_auth_transactions_state_hash_idx
    ON desktop_auth_transactions(state_hash);

CREATE INDEX desktop_auth_transactions_code_hash_idx
    ON desktop_auth_transactions(code_hash);

CREATE INDEX desktop_auth_transactions_expires_at_idx
    ON desktop_auth_transactions(expires_at);