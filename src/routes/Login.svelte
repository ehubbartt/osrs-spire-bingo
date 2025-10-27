<script>
  import { supabase } from "../lib/supabase";

  let { onLogin } = $props();

  let teamName = $state("");
  let pin = $state("");
  let error = $state("");
  let loading = $state(false);

  async function handleLogin() {
    error = "";
    loading = true;

    try {
      // Check if team exists
      const { data: teams, error: fetchError } = await supabase
        .from("teams")
        .select("*")
        .eq("team_name", teamName);

      if (fetchError) {
        console.error("Fetch error:", fetchError);
        error = "Database error. Check console.";
        loading = false;
        return;
      }

      if (!teams || teams.length === 0) {
        error = "Team not found";
        loading = false;
        return;
      }

      const team = teams[0];

      // In production, you'd hash the PIN and compare
      // For now, storing plain text (NOT SECURE - fix later)
      if (team.pin_hash !== pin) {
        error = "Incorrect PIN";
        loading = false;
        return;
      }

      // Success!
      onLogin(team);
    } catch (err) {
      error = "Login failed";
      console.error(err);
    }

    loading = false;
  }

  async function handleRegister() {
    error = "";
    loading = true;

    try {
      // Check if team name already exists
      const { data: existing } = await supabase
        .from("teams")
        .select("team_name")
        .eq("team_name", teamName);

      if (existing && existing.length > 0) {
        error = "Team name already taken";
        loading = false;
        return;
      }

      // Create new team (PIN stored as plain text for now - hash it later!)
      const { data: newTeam, error: insertError } = await supabase
        .from("teams")
        .insert({
          team_name: teamName,
          pin_hash: pin,
          current_floor: 1,
        })
        .select()
        .single();

      if (insertError) {
        console.error("Insert error:", insertError);
        error = insertError.message;
        loading = false;
        return;
      }

      // Initialize starter tiles for floor 1
      const floorData = await import("../lib/floors/floor1.json");
      const starterTiles = floorData.default.tiles.filter(tile => tile.isStarter);

      // Create team_progress entries for all tiles
      const progressEntries = floorData.default.tiles.map(tile => ({
        team_id: newTeam.id,
        tile_id: tile.id,
        status: tile.isStarter ? 'unlocked' : 'locked',
        proof_image_url: null,
        started_at: tile.isStarter ? new Date().toISOString() : null,
        completed_at: null,
        admin_verified: false,
        powerup_earned: tile.powerup,
        powerup_used: false
      }));

      const { error: progressError } = await supabase
        .from("team_progress")
        .insert(progressEntries);

      if (progressError) {
        console.error("Error initializing tiles:", progressError);
        // Continue anyway - they can still log in
      }

      onLogin(newTeam);
    } catch (err) {
      error = "Registration failed";
      console.error(err);
    }

    loading = false;
  }
</script>

<div class="login-container">
  <div class="login-card">
    <h1>OSRS Spire Bingo</h1>
    <p class="subtitle">Team Login</p>

    {#if error}
      <div class="error-message">{error}</div>
    {/if}

    <form onsubmit={(e) => { e.preventDefault(); handleLogin(); }}>
      <div class="form-group">
        <label for="teamName">Team Name</label>
        <input
          id="teamName"
          type="text"
          bind:value={teamName}
          placeholder="Enter team name"
          disabled={loading}
          required
        />
      </div>

      <div class="form-group">
        <label for="pin">PIN</label>
        <input
          id="pin"
          type="password"
          bind:value={pin}
          placeholder="Enter 4-digit PIN"
          maxlength="4"
          disabled={loading}
          required
        />
      </div>

      <div class="button-group">
        <button type="submit" class="btn btn-primary" disabled={loading}>
          {loading ? 'Loading...' : 'Login'}
        </button>
        <button
          type="button"
          class="btn btn-secondary"
          onclick={handleRegister}
          disabled={loading}
        >
          Register New Team
        </button>
      </div>
    </form>
  </div>
</div>

<style>
  .login-container {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 100vh;
    padding: 20px;
  }

  .login-card {
    background: #16213e;
    border: 2px solid #e94560;
    border-radius: 12px;
    padding: 40px;
    max-width: 400px;
    width: 100%;
    box-shadow: 0 8px 32px rgba(233, 69, 96, 0.2);
  }

  h1 {
    color: #e94560;
    text-align: center;
    margin: 0 0 10px 0;
    font-size: 2em;
    font-weight: bold;
  }

  .subtitle {
    text-align: center;
    color: #aaa;
    margin: 0 0 30px 0;
    font-size: 0.9em;
  }

  .error-message {
    background: rgba(233, 69, 96, 0.2);
    border: 1px solid #e94560;
    color: #ff6b81;
    padding: 12px;
    border-radius: 6px;
    margin-bottom: 20px;
    text-align: center;
    font-size: 0.9em;
  }

  .form-group {
    margin-bottom: 20px;
  }

  label {
    display: block;
    color: #ddd;
    margin-bottom: 8px;
    font-weight: 500;
    font-size: 0.9em;
  }

  input {
    width: 100%;
    padding: 12px;
    background: #1a1a2e;
    border: 2px solid #333;
    border-radius: 6px;
    color: #eee;
    font-size: 1em;
    transition: border-color 0.2s;
    box-sizing: border-box;
  }

  input:focus {
    outline: none;
    border-color: #e94560;
  }

  input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .button-group {
    display: flex;
    gap: 12px;
    margin-top: 30px;
  }

  .btn {
    flex: 1;
    padding: 12px 24px;
    border: none;
    border-radius: 6px;
    font-size: 1em;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-primary {
    background: #e94560;
    color: white;
  }

  .btn-primary:hover:not(:disabled) {
    background: #ff5573;
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(233, 69, 96, 0.4);
  }

  .btn-secondary {
    background: transparent;
    color: #e94560;
    border: 2px solid #e94560;
  }

  .btn-secondary:hover:not(:disabled) {
    background: rgba(233, 69, 96, 0.1);
    transform: translateY(-2px);
  }

  @media (max-width: 480px) {
    .login-card {
      padding: 30px 20px;
    }

    h1 {
      font-size: 1.5em;
    }

    .button-group {
      flex-direction: column;
    }
  }
</style>
