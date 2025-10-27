<script>
  import { onMount } from 'svelte';
  import Login from "./routes/Login.svelte";
  import Board from "./routes/Board.svelte";

  let currentTeam = $state(null);
  let currentView = $state("login");

  // Load saved login state on mount
  onMount(() => {
    const savedTeam = localStorage.getItem('osrs_bingo_team');
    if (savedTeam) {
      try {
        const teamData = JSON.parse(savedTeam);
        currentTeam = teamData;
        currentView = "board";
        console.log('Restored login state:', teamData.team_name);
      } catch (err) {
        console.error('Error restoring login state:', err);
        localStorage.removeItem('osrs_bingo_team');
      }
    }
  });

  function handleLogin(teamData) {
    currentTeam = teamData;
    currentView = "board";
    // Save to localStorage
    localStorage.setItem('osrs_bingo_team', JSON.stringify(teamData));
  }

  function handleLogout() {
    currentTeam = null;
    currentView = "login";
    // Clear localStorage
    localStorage.removeItem('osrs_bingo_team');
  }
</script>

<main>
  {#if currentView === "login"}
    <Login onLogin={handleLogin} />
  {:else if currentView === "board"}
    <Board team={currentTeam} onLogout={handleLogout} />
  {/if}
</main>

<style>
  main {
    width: 100vw;
    min-height: 100vh;
    background: #1a1a2e;
    color: #eee;
    margin: 0;
    padding: 0;
  }
</style>
