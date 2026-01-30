import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';

// --- CONFIGURATION ---
const API_URL = 'http://localhost:5000/api';

export default function App() {
  const [user, setUser] = useState(null); // { user, profile }
  const [activeTab, setActiveTab] = useState('add_inventory'); 

  // --- LOGIN LOGIC ---
  const handleLogin = async (e) => {
    e.preventDefault();
    const username = e.target.username.value;
    const password = e.target.password.value;

    try {
      const res = await axios.post(`${API_URL}/login`, { username, password });
      setUser(res.data);
      if (res.data.profile.role === 'employee') setActiveTab('add_inventory');
    } catch (err) {
      alert("Login Failed: " + (err.response?.data?.error || "Check your User ID/Password"));
    }
  };

  // --- HELPER: UPDATE USER STATE (Live Watermark Updates) ---
  const refreshUserWatermark = (newUrl) => {
    setUser(prev => ({
      ...prev,
      profile: {
        ...prev.profile,
        organizations: {
          ...prev.profile.organizations,
          watermark_url: newUrl
        }
      }
    }));
  };

  if (!user) {
    return (
      <div className="login-container">
        <h1>❄️ Cold Storage ERP</h1>
        <form onSubmit={handleLogin} className="login-form">
          <label>User ID</label>
          <input name="username" type="text" placeholder="e.g. admin" required autoFocus />
          <label>Password</label>
          <input name="password" type="password" placeholder="Enter Password" required />
          <button type="submit">Log In</button>
        </form>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <div className="sidebar">
        <h2>{user.profile.organizations.name}</h2>
        <div className="user-info">Role: <strong>{user.profile.role.toUpperCase()}</strong></div>
        <nav>
          <button onClick={() => setActiveTab('add_inventory')} className={activeTab === 'add_inventory' ? 'active' : ''}>➕ Add Inventory</button>
          {user.profile.role === 'manager' && (
            <>
              <button onClick={() => setActiveTab('view_inventory')} className={activeTab === 'view_inventory' ? 'active' : ''}>📦 View Inventory</button>
              <button onClick={() => setActiveTab('employees')} className={activeTab === 'employees' ? 'active' : ''}>👥 Employees</button>
              <button onClick={() => setActiveTab('settings')} className={activeTab === 'settings' ? 'active' : ''}>⚙️ Settings</button>
            </>
          )}
          <button onClick={() => setUser(null)} className="logout-btn">Log Out</button>
        </nav>
      </div>

      <div className="content-area">
        {activeTab === 'add_inventory' && <AddInventoryTab user={user} />}
        {activeTab === 'view_inventory' && <ViewInventoryTab user={user} />}
        {activeTab === 'employees' && <EmployeesTab user={user} />}
        {activeTab === 'settings' && <SettingsTab user={user} updateUser={refreshUserWatermark} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// SHARED COMPONENT: RECEIPT TEMPLATE
// ---------------------------------------------------------------------
// We pulled this out so both "Add Inventory" and "View Inventory" can use it
const ReceiptTemplate = ({ data, orgData, onClose }) => {
  const bgStyle = orgData.watermark_url ? { backgroundImage: `url("${orgData.watermark_url}")` } : {};

  return (
    <div className="receipt-wrapper">
      <div className="receipt-paper" style={bgStyle}>
        <h1 className="org-header">{orgData.name}</h1>
        <div className="receipt-body">
          <div className="receipt-meta">
            <p><strong>Date:</strong> {new Date(data.created_at || Date.now()).toLocaleDateString()}</p>
            <p><strong>Receipt #:</strong> {data.full_lot_number || data.lotNumber}</p>
          </div>
          
          <div className="farmer-info">
            <p><strong>Farmer:</strong> {data.farmer_name || data.farmerName} <strong>S/o</strong> {data.father_name || data.fatherName}</p>
            <p><strong>Bags Declared:</strong> {data.farmer_count || data.farmerCount}</p>
          </div>

          <table className="receipt-table">
            <thead><tr><th>Type</th><th>Count</th><th>Notes</th></tr></thead>
            <tbody>
              <tr><td>Mota</td><td>{data.count_mota || data.mota}</td><td>-</td></tr>
              <tr><td>Gulla</td><td>{data.count_gulla || data.gulla}</td><td>{(data.is_gulla_colored || data.isGullaColored) ? 'Colored' : 'Plain'}</td></tr>
              <tr><td>KetPeice</td><td>{data.count_ketpeice || data.ketpeice}</td><td>{(data.is_ketpeice_colored || data.isKetPeiceColored) ? 'Colored' : 'Plain'}</td></tr>
              <tr><td>Haara</td><td>{data.count_haara || data.haara}</td><td>-</td></tr>
            </tbody>
          </table>

          <div className="totals">
            <h3>Total Actual: {data.actual_count || data.actualCount}</h3>
            <p><strong>Marking:</strong> {(data.is_marked || data.isMarked) ? (data.mark_name || data.markName) : "None"}</p>
          </div>

          <div className="signatures">
            <div className="sign-box"><hr />Manager Signature</div>
            <div className="sign-box"><hr />Farmer Signature</div>
          </div>
        </div>
      </div>
      
      <div className="no-print">
        <button className="primary-btn" onClick={() => window.print()}>🖨️ Print</button>
        <button className="secondary-btn" onClick={onClose}>Close / Back</button>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------
// COMPONENT 1: ADD INVENTORY
// ---------------------------------------------------------------------
function AddInventoryTab({ user }) {
  const [formData, setFormData] = useState({
    farmerName: '', fatherName: '', farmerCount: '', lotBase: '',
    mota: 0, gulla: 0, isGullaColored: false,
    ketpeice: 0, isKetPeiceColored: false, haara: 0,
    isMarked: false, markName: ''
  });
  const [actualCount, setActualCount] = useState(0);
  const [receiptEntry, setReceiptEntry] = useState(null);

  useEffect(() => {
    const total = (parseInt(formData.mota)||0) + (parseInt(formData.gulla)||0) + (parseInt(formData.ketpeice)||0) + (parseInt(formData.haara)||0);
    setActualCount(total);
  }, [formData]);

  const handleSubmit = async () => {
    try {
      const res = await axios.post(`${API_URL}/inventory`, {
        orgId: user.profile.org_id, userId: user.user.id, ...formData, actualCount
      });
      // Merge form data with response so Receipt has everything
      setReceiptEntry({ ...formData, ...res.data.entry, lotNumber: res.data.lotNumber });
    } catch (err) {
      alert("Error: " + (err.response?.data?.error || err.message));
    }
  };

  if (receiptEntry) {
    return (
      <ReceiptTemplate 
        data={receiptEntry} 
        orgData={user.profile.organizations} 
        onClose={() => {
          setReceiptEntry(null); 
          setFormData({farmerName:'', fatherName:'', farmerCount:'', lotBase:'', mota:0, gulla:0, isGullaColored:false, ketpeice:0, isKetPeiceColored:false, haara:0, isMarked:false, markName:''});
        }} 
      />
    );
  }

  return (
    <div className="tab-container">
      <h2>Add New Stock</h2>
      <div className="form-grid">
         <div className="card"><h3>1. Farmer</h3>
            <div className="input-group"><label>Name</label><input value={formData.farmerName} onChange={e => setFormData({...formData, farmerName: e.target.value})} /></div>
            <div className="input-group"><label>Father Name</label><input value={formData.fatherName} onChange={e => setFormData({...formData, fatherName: e.target.value})} /></div>
            <div className="input-group"><label>Bags</label><input type="number" value={formData.farmerCount} onChange={e => setFormData({...formData, farmerCount: e.target.value})} /></div>
         </div>
         <div className="card"><h3>2. Potato</h3>
           <div className="input-group"><label>Lot</label><input value={formData.lotBase} onChange={e => setFormData({...formData, lotBase: e.target.value})} /></div>
           <div className="row"><label>Mota:</label><input type="number" value={formData.mota} onChange={e => setFormData({...formData, mota: e.target.value})} /></div>
           <div className="row"><label>Gulla:</label><input type="number" value={formData.gulla} onChange={e => setFormData({...formData, gulla: e.target.value})} /><label className="checkbox"><input type="checkbox" checked={formData.isGullaColored} onChange={e => setFormData({...formData, isGullaColored: e.target.checked})} /> Col?</label></div>
           <div className="row"><label>KetPeice:</label><input type="number" value={formData.ketpeice} onChange={e => setFormData({...formData, ketpeice: e.target.value})} /><label className="checkbox"><input type="checkbox" checked={formData.isKetPeiceColored} onChange={e => setFormData({...formData, isKetPeiceColored: e.target.checked})} /> Col?</label></div>
           <div className="row"><label>Haara:</label><input type="number" value={formData.haara} onChange={e => setFormData({...formData, haara: e.target.value})} /></div>
         </div>
         <div className="card"><h3>3. Verify</h3>
            <div className="marking-box"><label>Marked? <input type="checkbox" checked={formData.isMarked} onChange={e => setFormData({...formData, isMarked: e.target.checked})} /></label>{formData.isMarked && <input placeholder="Mark Name" value={formData.markName} onChange={e => setFormData({...formData, markName: e.target.value})} style={{width:'100%'}} />}</div>
            <div className="total-display">Total: {actualCount}</div>
            <button className="primary-btn full-width" onClick={handleSubmit}>Generate Receipt</button>
         </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// COMPONENT 2: VIEW INVENTORY (Updated with Reprint Feature)
// ---------------------------------------------------------------------
function ViewInventoryTab({ user }) {
  const [data, setData] = useState([]);
  const [selectedReceipt, setSelectedReceipt] = useState(null);

  const loadData = () => {
    axios.post(`${API_URL}/manager/inventory`, { orgId: user.profile.org_id })
      .then(res => setData(res.data))
      .catch(err => console.error(err));
  };

  const deleteEntry = async (id) => {
    if (!confirm("Are you sure you want to DELETE this entry permanently?")) return;
    try {
      await axios.post(`${API_URL}/manager/delete-inventory`, { entryId: id });
      loadData();
    } catch (err) { alert("Delete failed"); }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, []);

  // Show Receipt View if an item is selected
  if (selectedReceipt) {
    return (
      <ReceiptTemplate 
        data={selectedReceipt} 
        orgData={user.profile.organizations} // This passes the LIVE watermark
        onClose={() => setSelectedReceipt(null)} 
      />
    );
  }

  return (
    <div className="tab-container">
      <div className="header-row"><h2>Global Inventory</h2><button className="secondary-btn" onClick={loadData}>🔄 Refresh</button></div>
      <table className="data-table">
        <thead><tr><th>Date</th><th>Lot #</th><th>Farmer</th><th>Total</th><th>Added By</th><th>Actions</th></tr></thead>
        <tbody>
          {data.length === 0 ? <tr><td colSpan="6">No records.</td></tr> : data.map(item => (
            <tr key={item.id}>
              <td>{new Date(item.created_at).toLocaleDateString()}</td>
              <td>{item.full_lot_number}</td>
              <td>{item.farmer_name}</td>
              <td>{item.actual_count}</td>
              <td>{item.profiles?.full_name || 'Unknown'}</td>
              <td style={{display:'flex', gap:'5px'}}>
                <button className="action-btn" onClick={() => setSelectedReceipt(item)}>🖨️ Print</button>
                <button className="danger-btn-small" onClick={() => deleteEntry(item.id)}>🗑️</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------
// COMPONENT 3: SETTINGS (Unchanged)
// ---------------------------------------------------------------------
function SettingsTab({ user, updateUser }) {
  const [currentWatermark, setCurrentWatermark] = useState(user.profile.organizations.watermark_url || '');
  const [selectedFile, setSelectedFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleUpload = async () => {
    if (!selectedFile) return alert("Select an image first.");
    setIsUploading(true);
    const reader = new FileReader();
    reader.readAsDataURL(selectedFile);
    reader.onloadend = async () => {
      try {
        await axios.post(`${API_URL}/manager/settings`, { orgId: user.profile.org_id, watermarkUrl: reader.result });
        updateUser(reader.result);
        setCurrentWatermark(reader.result);
        alert("Watermark Saved!");
        setSelectedFile(null);
      } catch (err) { alert("Upload failed (Max 10MB)"); } finally { setIsUploading(false); }
    };
  };

  return (
    <div className="tab-container">
      <h2>Receipt Settings</h2>
      <div className="card"><h3>Upload Watermark</h3><input type="file" accept="image/*" onChange={e => setSelectedFile(e.target.files[0])} /><br/><br/><button className="primary-btn" onClick={handleUpload} disabled={isUploading}>{isUploading ? "Saving..." : "Save Watermark"}</button></div>
      <div className="preview-section" style={{marginTop:'20px'}}><h4>Current:</h4>{currentWatermark ? <div style={{border:'2px dashed #ccc', padding:'10px', display:'inline-block', background:'white'}}><img src={currentWatermark} alt="Watermark" style={{maxHeight:'150px', opacity:0.5}} /></div> : <p>None.</p>}</div>
    </div>
  );
}

// ---------------------------------------------------------------------
// COMPONENT 4: EMPLOYEES (Unchanged)
// ---------------------------------------------------------------------
function EmployeesTab({ user }) {
  const [employees, setEmployees] = useState([]);
  const [newEmp, setNewEmp] = useState({ name: '', phone: '', username: '', password: '' });
  const loadEmployees = () => { axios.post(`${API_URL}/manager/employees`, { orgId: user.profile.org_id }).then(res => setEmployees(res.data)); };
  useEffect(loadEmployees, []);
  const addEmployee = async () => { try { await axios.post(`${API_URL}/manager/add-employee`, { orgId: user.profile.org_id, ...newEmp }); alert("Created!"); setNewEmp({name:'',phone:'',username:'',password:''}); loadEmployees(); } catch (e) { alert("Error"); } };
  const removeEmployee = async (id) => { if(confirm("Remove?")) { await axios.post(`${API_URL}/manager/remove-employee`, { userId: id }); loadEmployees(); }};
  return (
    <div className="tab-container"><h2>Employees</h2><div className="add-emp-box card"><div className="emp-form-grid"><input placeholder="Name" value={newEmp.name} onChange={e=>setNewEmp({...newEmp,name:e.target.value})}/><input placeholder="Phone" value={newEmp.phone} onChange={e=>setNewEmp({...newEmp,phone:e.target.value})}/><input placeholder="User ID" value={newEmp.username} onChange={e=>setNewEmp({...newEmp,username:e.target.value})}/><input placeholder="Password" value={newEmp.password} onChange={e=>setNewEmp({...newEmp,password:e.target.value})}/></div><button className="primary-btn" onClick={addEmployee} style={{marginTop:'10px'}}>Add</button></div><div className="emp-list">{employees.map(e=><div key={e.id} className="emp-card"><div><h4>{e.full_name}</h4><p>{e.username}</p></div><button className="danger-btn" onClick={()=>removeEmployee(e.id)}>Remove</button></div>)}</div></div>
  );
}