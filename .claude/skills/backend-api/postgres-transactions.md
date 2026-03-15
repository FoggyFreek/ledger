#### BEGIN / COMMIT `await sql.begin([options = ''], fn) -> fn()`

Use `sql.begin` to start a new transaction. Postgres.js will reserve a connection for the transaction and supply a scoped `sql` instance for all transaction uses in the callback function. `sql.begin` will resolve with the returned value from the callback function.

`BEGIN` is automatically sent with the optional options, and if anything fails `ROLLBACK` will be called so the connection can be released and execution can continue.

```js
const [user, account] = await sql.begin(async sql => {
  const [user] = await sql`
    insert into users (
      name
    ) values (
      'Murray'
    )
    returning *
  `

  const [account] = await sql`
    insert into accounts (
      user_id
    ) values (
      ${ user.user_id }
    )
    returning *
  `

  return [user, account]
})
```

It's also possible to pipeline the requests in a transaction if needed by returning an array with queries from the callback function like this:

```js
const result = await sql.begin(sql => [
  sql`update ...`,
  sql`update ...`,
  sql`insert ...`
])
```

**Convention: build queries outside `sql.begin`, keep the callback logic-free.**

Always construct query objects *before* calling `sql.begin()`, so the callback only returns a flat array of pre-built queries with no logic (no `if`, no `.map()`, no `await`). For conditional inserts, use `sql\`SELECT 1\`` as a no-op.

```js
// ✅ Correct — all logic is outside sql.begin
const deleteQuery = sql`DELETE FROM wallets WHERE address != ALL(${sql.array(addrs)})`;
const upsertQueries = wallets.map(w => sql`
  INSERT INTO wallets (address, label) VALUES (${w.address}, ${w.label})
  ON CONFLICT (address) DO UPDATE SET label = EXCLUDED.label
`);

await sql.begin(() => [deleteQuery, ...upsertQueries]);
```

```js
// ✅ Conditional insert with no-op fallback
const deleteQuery = sql`DELETE FROM stake_accounts WHERE wallet_address = ${addr}`;
const insertQuery = data.length > 0
  ? sql`INSERT INTO stake_accounts ${sql(rows)}`
  : sql`SELECT 1`;
const metaQuery = sql`
  INSERT INTO stake_accounts_meta (wallet_address, fetched_at)
  VALUES (${addr}, ${fetchedAt})
  ON CONFLICT (wallet_address) DO UPDATE SET fetched_at = EXCLUDED.fetched_at
`;

await sql.begin(() => [deleteQuery, insertQuery, metaQuery]);
```

```js
// ❌ Wrong — logic inside sql.begin callback
await sql.begin(async sql => {
  await sql`DELETE FROM stake_accounts WHERE wallet_address = ${addr}`;
  if (data.length > 0) {
    await sql`INSERT INTO stake_accounts ${sql(rows)}`;
  }
  await sql`INSERT INTO stake_accounts_meta ...`;
});
```


#### SAVEPOINT `await sql.savepoint([name], fn) -> fn()`

```js
sql.begin('read write', async sql => {
  const [user] = await sql`
    insert into users (
      name
    ) values (
      'Murray'
    )
  `

  const [account] = (await sql.savepoint(sql =>
    sql`
      insert into accounts (
        user_id
      ) values (
        ${ user.user_id }
      )
    `
  ).catch(err => {
    // Account could not be created. ROLLBACK SAVEPOINT is called because we caught the rejection.
  })) || []

  return [user, account]
})
.then(([user, account]) => {
  // great success - COMMIT succeeded
})
.catch(() => {
  // not so good - ROLLBACK was called
})
```


#### PREPARE TRANSACTION `await sql.prepare([name]) -> fn()`

Indicates that the transactions should be prepared using the [`PREPARE TRANSACTION [NAME]`](https://www.postgresql.org/docs/current/sql-prepare-transaction.html) statement
instead of being committed.

```js
sql.begin('read write', async sql => {
  const [user] = await sql`
    insert into users (
      name
    ) values (
      'Murray'
    )
  `

  await sql.prepare('tx1')
})
```