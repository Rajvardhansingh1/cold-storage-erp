require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());

// *** CONFIGURATION: INCREASE DATA LIMIT FOR IMAGES ***
// This allows uploading large Watermark images (up to 10MB)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

const PORT = process.env.PORT || 5000;
const HIDDEN_DOMAIN = "@coldstorage.app"; 

// --- SUPABASE CLIENTS ---

// 1. Standard Client (Respects Security Rules)
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// 2. Admin Client (Bypasses Security Rules - The "God Mode" Client)
const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// --- ROUTES ---

// 1. LOGIN ROUTE (Username Only)
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  
  // Auto-generate the full email internally
  const hiddenEmail = `${username}${HIDDEN_DOMAIN}`;
  console.log(`[LOGIN ATTEMPT] User: ${username}`);

  // Sign in
  const { data, error } = await supabase.auth.signInWithPassword({ 
    email: hiddenEmail, 
    password: password 
  });
  
  if (error) {
    console.error("[LOGIN FAILED]", error.message);
    return res.status(401).json({ error: "Invalid User ID or Password" });
  }

  // Get Profile
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*, organizations(*)')
    .eq('id', data.user.id)
    .single();

  if (profileError) return res.status(400).json({ error: "Profile not found." });

  res.json({ user: data.user, profile });
});

// 2. ADD EMPLOYEE (Manager Only - Uses Admin Client)
app.post('/api/manager/add-employee', async (req, res) => {
  const { orgId, name, phone, username, password } = req.body;
  const cleanUsername = username.split('@')[0].trim();
  const hiddenEmail = `${cleanUsername}${HIDDEN_DOMAIN}`;

  try {
    // A. Create User in Auth
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: hiddenEmail,
      password: password,
      email_confirm: true,
      user_metadata: { displayName: name }
    });

    if (authError) throw authError;

    // B. Create Profile
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: authUser.user.id,
        org_id: orgId,
        full_name: name,
        phone_number: phone,
        username: cleanUsername,
        role: 'employee'
      });

    if (profileError) throw profileError;

    res.json({ success: true, message: "Employee Created" });
  } catch (err) {
    console.error("[ADD EMP ERROR]", err.message);
    res.status(400).json({ error: err.message });
  }
});

// 3. GET EMPLOYEES
app.post('/api/manager/employees', async (req, res) => {
  const { orgId } = req.body;
  // Admin client ensures we see all employees regardless of RLS
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('org_id', orgId)
    .eq('role', 'employee'); 
  
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// 4. REMOVE EMPLOYEE
app.post('/api/manager/remove-employee', async (req, res) => {
  const { userId } = req.body;
  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ success: true });
});

// 5. UPDATE SETTINGS (Watermark)
app.post('/api/manager/settings', async (req, res) => {
  const { orgId, watermarkUrl } = req.body;
  
  // We use Admin client here too, just to be safe with permissions
  const { error } = await supabaseAdmin
    .from('organizations')
    .update({ watermark_url: watermarkUrl })
    .eq('id', orgId);

  if (error) return res.status(400).json({ error: error.message });
  res.json({ success: true });
});

// 6. VIEW INVENTORY (Manager View - Uses Admin to see EVERYTHING)
app.post('/api/manager/inventory', async (req, res) => {
  const { orgId } = req.body;
  
  const { data, error } = await supabaseAdmin
    .from('inventory_entries')
    .select('*, profiles(full_name)') // This works now because we fixed the Foreign Key
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// 7. DELETE INVENTORY (New Feature)
app.post('/api/manager/delete-inventory', async (req, res) => {
  const { entryId } = req.body;

  try {
    const { error } = await supabaseAdmin
      .from('inventory_entries')
      .delete()
      .eq('id', entryId);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error("[DELETE ERROR]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// 8. ADD INVENTORY ENTRY (Standard - Fixed RLS & Structure)
app.post('/api/inventory', async (req, res) => {
  const { 
    orgId, userId, farmerName, fatherName, farmerCount, 
    lotBase, actualCount,
    mota, gulla, isGullaColored, 
    ketpeice, isKetPeiceColored, 
    haara, 
    isMarked, markName 
  } = req.body;

  try {
    // A. Get Next Index (Using Admin Client is safest)
    const { data: nextIndex, error: rpcError } = await supabaseAdmin
      .rpc('get_next_lot_index', { 
        org_id_input: orgId, 
        lot_base_input: lotBase 
      });

    if (rpcError) throw rpcError;

    // B. Generate Lot String
    const fullLotNumber = `${lotBase}.${nextIndex}/${farmerCount}`;

    // C. Insert Data (Using Admin Client bypasses "Anonymous User" RLS errors)
    const { data, error } = await supabaseAdmin
      .from('inventory_entries')
      .insert({
        org_id: orgId,
        created_by: userId,
        farmer_name: farmerName,
        father_name: fatherName,
        farmer_count: farmerCount,
        
        lot_number_base: lotBase,
        lot_index: nextIndex,
        full_lot_number: fullLotNumber,

        count_mota: mota,
        count_gulla: gulla,
        is_gulla_colored: isGullaColored,
        count_ketpeice: ketpeice,        
        is_ketpeice_colored: isKetPeiceColored, 
        count_haara: haara,
        
        is_marked: isMarked,
        mark_name: markName,
        actual_count: actualCount
      })
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, entry: data, lotNumber: fullLotNumber });

  } catch (err) {
    console.error("[INVENTORY ERROR]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// --- START SERVER ---
app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));