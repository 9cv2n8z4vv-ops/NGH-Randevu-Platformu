-- Keep relocatable extensions outside the API-exposed public schema.
alter extension btree_gist set schema extensions;
