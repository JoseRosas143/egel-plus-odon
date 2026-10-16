-- Already applied to Egel. Do not run twice.
create policy import_permissions_no_client on egel_private.bank_import_permissions for all to anon, authenticated using (false) with check (false);
