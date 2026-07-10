import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { doc, increment, updateDoc, writeBatch } from "firebase/firestore";
import { db } from "../assets/firebase";
import { useMatchForMat } from "../hooks/useMatchForMat";
import { advanceWinner } from "../utils/bracketUtils";
import type { MatchWithId } from "../types";

// Helper to reorder matches in Firestore
async function reorderMatches(matches: MatchWithId[]) {
  const batch = writeBatch(db);
  matches.forEach((match, index) => {
    const ref = doc(db, "matches", match.id);
    batch.update(ref, { queueOrder: index });
  });
  await batch.commit();
}

type Fighter = "A" | "B";
type ScoreType = "points" | "advantages" | "penalties";
type MenuState = { fighter: Fighter; type: ScoreType } | "finish" | null;

// Fullscreen API helpers
function requestFullscreen(element: HTMLElement) {
  if (element.requestFullscreen) {
    element.requestFullscreen();
  } else if ((element as HTMLElement & { webkitRequestFullscreen?: () => void }).webkitRequestFullscreen) {
    (element as HTMLElement & { webkitRequestFullscreen: () => void }).webkitRequestFullscreen();
  } else if ((element as HTMLElement & { msRequestFullscreen?: () => void }).msRequestFullscreen) {
    (element as HTMLElement & { msRequestFullscreen: () => void }).msRequestFullscreen();
  }
}

function exitFullscreen() {
  if (document.exitFullscreen) {
    document.exitFullscreen();
  } else if ((document as Document & { webkitExitFullscreen?: () => void }).webkitExitFullscreen) {
    (document as Document & { webkitExitFullscreen: () => void }).webkitExitFullscreen();
  } else if ((document as Document & { msExitFullscreen?: () => void }).msExitFullscreen) {
    (document as Document & { msExitFullscreen: () => void }).msExitFullscreen();
  }
}

function isFullscreen(): boolean {
  return !!(
    document.fullscreenElement ||
    (document as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement ||
    (document as Document & { msFullscreenElement?: Element }).msFullscreenElement
  );
}

async function updateScore(matchId: string, fighter: Fighter, type: ScoreType, delta: number) {
  const fieldMap = {
    points: fighter === "A" ? "PointsA" : "PointsB",
    advantages: fighter === "A" ? "AdvantagesA" : "AdvantagesB",
    penalties: fighter === "A" ? "PenaltiesA" : "PenaltiesB",
  };
  const ref = doc(db, "matches", matchId);
  await updateDoc(ref, { [fieldMap[type]]: increment(delta) });
}

async function finishMatchAndAdvance(
  match: MatchWithId,
  winner: Fighter,
  method: "points" | "submission" | "ref_decision"
) {
  const ref = doc(db, "matches", match.id);
  const winnerId = winner === "A" ? "fighterA" : "fighterB";

  await updateDoc(ref, {
    Status: "finished",
    WinnerId: winnerId,
    WinMethod: method,
  });

  // Advance winner to next match if this is part of a bracket
  if (match.nextMatchId && match.nextMatchSlot) {
    await advanceWinner({
      ...match,
      WinnerId: winnerId,
      WinMethod: method,
      Status: "finished",
    });
  }
}

const DEFAULT_MATCH_DURATION = 5 * 60; // 5 minutes default

export default function MatScoringPage() {
  const { matId } = useParams<{ matId: string }>();
  const navigate = useNavigate();
  const id = matId ?? "";
  const { loading, error, currentMatch, queue } = useMatchForMat(id);
  const [activeMenu, setActiveMenu] = useState<MenuState>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreenMode, setIsFullscreenMode] = useState(false);

  // Timer state
  const matchDuration = currentMatch?.matchDuration ?? DEFAULT_MATCH_DURATION;
  const [timeLeft, setTimeLeft] = useState(matchDuration);
  const [isRunning, setIsRunning] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevMatchId = useRef<string | null>(null);

  // Fullscreen toggle
  const toggleFullscreen = useCallback(() => {
    if (isFullscreen()) {
      exitFullscreen();
    } else if (containerRef.current) {
      requestFullscreen(containerRef.current);
    }
  }, []);

  // Listen for fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreenMode(isFullscreen());
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    document.addEventListener("msfullscreenchange", handleFullscreenChange);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
      document.removeEventListener("msfullscreenchange", handleFullscreenChange);
    };
  }, []);

  // Reset timer when match changes
  useEffect(() => {
    if (currentMatch && currentMatch.id !== prevMatchId.current) {
      prevMatchId.current = currentMatch.id;
      setTimeLeft(currentMatch.matchDuration ?? DEFAULT_MATCH_DURATION);
      setIsRunning(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [currentMatch]);

  // Timer logic
  useEffect(() => {
    if (isRunning && timeLeft > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            setIsRunning(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isRunning, timeLeft]);

  const toggleTimer = () => setIsRunning(!isRunning);
  const resetTimer = () => {
    setIsRunning(false);
    setTimeLeft(matchDuration);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  if (!id) return <div>Missing matId</div>;
  if (loading) return <div style={{ padding: 40, textAlign: "center" }}>Loading...</div>;
  if (error) return <div style={{ color: "crimson", padding: 40 }}>{error}</div>;
  if (!currentMatch) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <h2>No active match on {id.toUpperCase()}</h2>
        <button onClick={() => navigate("/dashboard")} style={{ marginTop: 16 }}>
          Back to Dashboard
        </button>
      </div>
    );
  }

  const closeMenu = () => setActiveMenu(null);

  const handleScore = async (fighter: Fighter, type: ScoreType, delta: number) => {
    await updateScore(currentMatch.id, fighter, type, delta);
    closeMenu();
  };

  const handleFinish = async (winner: Fighter, method: "points" | "submission" | "ref_decision") => {
    await finishMatchAndAdvance(currentMatch, winner, method);
    closeMenu();
  };

  return (
    <div
      ref={containerRef}
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "#121212",
      }}
      onClick={closeMenu}
    >
      {/* Header */}
      <div style={{
        background: "#1a1a1a",
        padding: "16px 24px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        borderBottom: "1px solid #333",
      }}>
        <div style={{ fontSize: "1.75rem", fontWeight: 700, textTransform: "uppercase", color: "white" }}>
          {id.replace("mat", "Mat ")}
        </div>
        <div style={{ fontSize: "1.25rem", color: "#888" }}>
          Round {currentMatch.Round}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={toggleFullscreen}
            style={{
              padding: "6px 12px",
              fontSize: "0.875rem",
              background: isFullscreenMode ? "#0d6efd" : "transparent",
              border: "1px solid #444",
              color: "white",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            {isFullscreenMode ? "Exit Fullscreen" : "Fullscreen"}
          </button>
          <button
            onClick={() => navigate("/dashboard")}
            style={{
              padding: "6px 12px",
              fontSize: "0.875rem",
              background: "transparent",
              border: "1px solid #444",
              color: "white",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            Exit
          </button>
        </div>
      </div>

      {/* Main Scoring Area */}
      <div style={{
        flex: 1,
        display: "grid",
        gridTemplateColumns: "1fr auto 1fr",
        position: "relative",
      }}>
        {/* Fighter A - Red */}
        <FighterSide
          fighter="A"
          match={currentMatch}
          activeMenu={activeMenu}
          onMenuOpen={(type) => setActiveMenu({ fighter: "A", type })}
          onScore={(type, delta) => handleScore("A", type, delta)}
        />

        {/* Timer in the middle */}
        <div style={{
          background: "#1a1a1a",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "20px 32px",
          gap: 20,
          borderLeft: "2px solid #333",
          borderRight: "2px solid #333",
        }}>
          <div style={{
            fontSize: "6rem",
            fontWeight: 800,
            fontFamily: "monospace",
            color: timeLeft <= 30 ? "#dc3545" : timeLeft <= 60 ? "#ffc107" : "white",
          }}>
            {formatTime(timeLeft)}
          </div>

          <div style={{ display: "flex", gap: 12 }}>
            <button
              onClick={toggleTimer}
              style={{
                padding: "16px 32px",
                fontSize: "1.25rem",
                fontWeight: 600,
                background: isRunning ? "#dc3545" : "#28a745",
                color: "white",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
                minWidth: 120,
              }}
            >
              {isRunning ? "PAUSE" : "START"}
            </button>
            <button
              onClick={resetTimer}
              style={{
                padding: "16px 24px",
                fontSize: "1.25rem",
                fontWeight: 600,
                background: "#6c757d",
                color: "white",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              RESET
            </button>
          </div>
        </div>

        {/* Fighter B - Blue */}
        <FighterSide
          fighter="B"
          match={currentMatch}
          activeMenu={activeMenu}
          onMenuOpen={(type) => setActiveMenu({ fighter: "B", type })}
          onScore={(type, delta) => handleScore("B", type, delta)}
        />
      </div>

      {/* Finish Match Button */}
      <div style={{
        padding: "20px",
        display: "flex",
        justifyContent: "center",
        background: "#1a1a1a",
        position: "relative",
      }}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setActiveMenu(activeMenu === "finish" ? null : "finish");
          }}
          style={{
            padding: "20px 64px",
            fontSize: "1.5rem",
            fontWeight: 700,
            background: "#ffc107",
            color: "#000",
            border: "none",
            borderRadius: 8,
            cursor: "pointer",
          }}
        >
          FINISH MATCH
        </button>

        {activeMenu === "finish" && (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              bottom: "100%",
              left: "50%",
              transform: "translateX(-50%)",
              background: "#1a1a1a",
              border: "2px solid #ffc107",
              borderRadius: 8,
              padding: 16,
              marginBottom: 8,
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 16,
              minWidth: 360,
            }}
          >
            <FinishColumn
              name={currentMatch.FighterAName}
              color="#dc3545"
              onSelect={(method) => handleFinish("A", method)}
            />
            <FinishColumn
              name={currentMatch.FighterBName}
              color="#333"
              onSelect={(method) => handleFinish("B", method)}
            />
          </div>
        )}
      </div>

      {/* Draggable Queue */}
      {queue.length > 0 && (
        <DraggableQueue queue={queue} onReorder={reorderMatches} />
      )}
    </div>
  );
}

function FighterSide({
  fighter,
  match,
  activeMenu,
  onMenuOpen,
  onScore,
}: {
  fighter: Fighter;
  match: MatchWithId;
  activeMenu: MenuState;
  onMenuOpen: (type: ScoreType) => void;
  onScore: (type: ScoreType, delta: number) => void;
}) {
  const isRed = fighter === "A";
  const name = isRed ? match.FighterAName : match.FighterBName;
  const points = isRed ? match.PointsA : match.PointsB;
  const advantages = isRed ? match.AdvantagesA : match.AdvantagesB;
  const penalties = isRed ? match.PenaltiesA : match.PenaltiesB;
  const bgColor = isRed ? "#dc3545" : "#ffffff";
  const textColor = isRed ? "white" : "#000000";
  const secondaryBg = isRed ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.1)";

  const isMenuOpen = (type: ScoreType) =>
    activeMenu !== null && activeMenu !== "finish" && activeMenu.fighter === fighter && activeMenu.type === type;

  return (
    <div
      style={{
        background: bgColor,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "24px 16px",
        color: textColor,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Name */}
      <div style={{
        fontSize: "3.5rem",
        fontWeight: 900,
        textTransform: "uppercase",
        textAlign: "center",
        marginBottom: 16,
      }}>
        {name}
      </div>

      {/* Points */}
      <div
        onClick={() => onMenuOpen("points")}
        style={{
          cursor: "pointer",
          textAlign: "center",
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          position: "relative",
        }}
      >
        <div style={{
          fontSize: "16rem",
          fontWeight: 800,
          lineHeight: 1,
          textShadow: isRed ? "2px 2px 8px rgba(0,0,0,0.3)" : "none",
        }}>
          {points}
        </div>
        <div style={{ fontSize: "1.5rem", textTransform: "uppercase", opacity: 0.8 }}>
          Points
        </div>

        {isMenuOpen("points") && (
          <ScoreMenu type="points" color={isRed ? "#dc3545" : "#333"} onSelect={(delta) => onScore("points", delta)} position="right" />
        )}
      </div>

      {/* ADV & PEN */}
      <div style={{ display: "flex", gap: 32, marginTop: 24 }}>
        <div
          onClick={() => onMenuOpen("advantages")}
          style={{
            cursor: "pointer",
            padding: "16px 28px",
            background: secondaryBg,
            borderRadius: 8,
            textAlign: "center",
            position: "relative",
          }}
        >
          <div style={{ fontSize: "5rem", fontWeight: 700, lineHeight: 1 }}>{advantages}</div>
          <div style={{ fontSize: "1.25rem", textTransform: "uppercase", opacity: 0.9 }}>ADV</div>

          {isMenuOpen("advantages") && (
            <ScoreMenu type="advantages" color={isRed ? "#dc3545" : "#333"} onSelect={(delta) => onScore("advantages", delta)} />
          )}
        </div>

        <div
          onClick={() => onMenuOpen("penalties")}
          style={{
            cursor: "pointer",
            padding: "16px 28px",
            background: secondaryBg,
            borderRadius: 8,
            textAlign: "center",
            position: "relative",
          }}
        >
          <div style={{ fontSize: "5rem", fontWeight: 700, lineHeight: 1 }}>{penalties}</div>
          <div style={{ fontSize: "1.25rem", textTransform: "uppercase", opacity: 0.9 }}>PEN</div>

          {isMenuOpen("penalties") && (
            <ScoreMenu type="penalties" color={isRed ? "#dc3545" : "#333"} onSelect={(delta) => onScore("penalties", delta)} />
          )}
        </div>
      </div>
    </div>
  );
}

function ScoreMenu({
  type,
  color,
  onSelect,
  position = "top",
}: {
  type: ScoreType;
  color: string;
  onSelect: (delta: number) => void;
  position?: "top" | "right";
}) {
  const baseStyle: React.CSSProperties = {
    position: "absolute",
    background: "#1a1a1a",
    border: `2px solid ${color}`,
    borderRadius: 8,
    padding: 8,
    zIndex: 100,
    display: "grid",
    gap: 6,
    minWidth: 160,
  };

  const menuStyle: React.CSSProperties = position === "right"
    ? {
        ...baseStyle,
        left: "100%",
        top: "50%",
        transform: "translateY(-50%)",
        marginLeft: 16,
      }
    : {
        ...baseStyle,
        left: "50%",
        transform: "translateX(-50%)",
        bottom: "100%",
        marginBottom: 12,
      };

  const btnStyle: React.CSSProperties = {
    padding: "12px 16px",
    background: color,
    color: "white",
    border: "none",
    borderRadius: 4,
    cursor: "pointer",
    fontSize: "1rem",
    fontWeight: 600,
  };

  const undoStyle: React.CSSProperties = {
    ...btnStyle,
    background: "#6c757d",
  };

  if (type === "points") {
    return (
      <div style={menuStyle} onClick={(e) => e.stopPropagation()}>
        <button style={btnStyle} onClick={() => onSelect(2)}>+2 Takedown</button>
        <button style={btnStyle} onClick={() => onSelect(2)}>+2 Sweep</button>
        <button style={btnStyle} onClick={() => onSelect(3)}>+3 Pass</button>
        <button style={btnStyle} onClick={() => onSelect(4)}>+4 Mount</button>
        <button style={btnStyle} onClick={() => onSelect(4)}>+4 Back</button>
        <button style={undoStyle} onClick={() => onSelect(-1)}>-1 Undo</button>
      </div>
    );
  }

  if (type === "advantages") {
    return (
      <div style={menuStyle} onClick={(e) => e.stopPropagation()}>
        <button style={btnStyle} onClick={() => onSelect(1)}>+1 Advantage</button>
        <button style={undoStyle} onClick={() => onSelect(-1)}>-1 Undo</button>
      </div>
    );
  }

  return (
    <div style={menuStyle} onClick={(e) => e.stopPropagation()}>
      <button style={btnStyle} onClick={() => onSelect(1)}>+1 Penalty</button>
      <button style={undoStyle} onClick={() => onSelect(-1)}>-1 Undo</button>
    </div>
  );
}

function FinishColumn({
  name,
  color,
  onSelect,
}: {
  name: string;
  color: string;
  onSelect: (method: "points" | "submission" | "ref_decision") => void;
}) {
  const btnStyle: React.CSSProperties = {
    padding: "12px",
    background: color,
    color: "white",
    border: "none",
    borderRadius: 4,
    cursor: "pointer",
    fontWeight: 600,
  };

  return (
    <div>
      <div style={{
        textAlign: "center",
        fontWeight: 700,
        fontSize: "0.875rem",
        textTransform: "uppercase",
        color: color,
        marginBottom: 8,
      }}>
        {name}
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        <button style={btnStyle} onClick={() => onSelect("submission")}>Submission</button>
        <button style={btnStyle} onClick={() => onSelect("points")}>Points</button>
        <button style={btnStyle} onClick={() => onSelect("ref_decision")}>Ref Decision</button>
      </div>
    </div>
  );
}

function DraggableQueue({
  queue,
  onReorder,
}: {
  queue: MatchWithId[];
  onReorder: (newOrder: MatchWithId[]) => Promise<void>;
}) {
  const [showModal, setShowModal] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", index.toString());
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverIndex(index);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = async (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    const newQueue = [...queue];
    const [removed] = newQueue.splice(draggedIndex, 1);
    newQueue.splice(dropIndex, 0, removed);

    setDraggedIndex(null);
    setDragOverIndex(null);

    await onReorder(newQueue);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const nextMatch = queue[0];
  const remainingCount = queue.length - 1;

  return (
    <>
      {/* Compact Bar */}
      <div
        style={{
          background: "#1a1a1a",
          padding: "12px 20px",
          borderTop: "1px solid #333",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{
            fontSize: "0.75rem",
            fontWeight: 600,
            color: "#0d6efd",
            textTransform: "uppercase",
          }}>
            Up Next
          </div>
          <div style={{ fontSize: "1rem", color: "#fff" }}>
            {nextMatch.FighterAName} <span style={{ color: "#666" }}>vs</span> {nextMatch.FighterBName}
          </div>
          {remainingCount > 0 && (
            <div style={{
              fontSize: "0.875rem",
              color: "#666",
            }}>
              +{remainingCount} more
            </div>
          )}
        </div>

        <button
          onClick={() => setShowModal(true)}
          style={{
            padding: "8px 16px",
            background: "#333",
            border: "none",
            borderRadius: 6,
            color: "#fff",
            fontSize: "0.875rem",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span style={{ fontSize: "1rem" }}>☰</span>
          Manage Queue
        </button>
      </div>

      {/* Modal */}
      {showModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.85)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 20,
          }}
          onClick={() => setShowModal(false)}
        >
          <div
            style={{
              background: "#1a1a1a",
              borderRadius: 12,
              maxWidth: 500,
              width: "100%",
              maxHeight: "80vh",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{
              padding: "16px 20px",
              borderBottom: "1px solid #333",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "1.125rem" }}>Match Queue</h3>
                <p style={{ margin: "4px 0 0 0", fontSize: "0.75rem", color: "#888" }}>
                  Drag to reorder • {queue.length} matches remaining
                </p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                style={{
                  width: 32,
                  height: 32,
                  background: "#333",
                  border: "none",
                  borderRadius: 6,
                  color: "#888",
                  fontSize: "1.25rem",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                ×
              </button>
            </div>

            {/* Queue List */}
            <div style={{
              padding: 12,
              overflowY: "auto",
              flex: 1,
            }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {queue.map((m, index) => (
                  <div
                    key={m.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, index)}
                    onDragEnd={handleDragEnd}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "12px 14px",
                      background: dragOverIndex === index ? "#0d6efd22" : "#2a2a2a",
                      borderRadius: 8,
                      cursor: "grab",
                      opacity: draggedIndex === index ? 0.5 : 1,
                      border: dragOverIndex === index ? "2px dashed #0d6efd" : "2px solid transparent",
                      transition: "background 0.15s, border 0.15s",
                    }}
                  >
                    <div style={{
                      width: 28,
                      height: 28,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: index === 0 ? "#0d6efd" : "#444",
                      borderRadius: 6,
                      fontSize: "0.875rem",
                      fontWeight: 700,
                      color: index === 0 ? "#fff" : "#888",
                      flexShrink: 0,
                    }}>
                      {index + 1}
                    </div>
                    <div style={{
                      color: "#555",
                      fontSize: "1.125rem",
                      flexShrink: 0,
                    }}>
                      ⠿
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: "0.9375rem", color: "#fff" }}>
                        {m.FighterAName} <span style={{ color: "#666" }}>vs</span> {m.FighterBName}
                      </div>
                    </div>
                    {m.queueOrder !== undefined && (
                      <div style={{
                        fontSize: "0.625rem",
                        color: "#0d6efd",
                        background: "#0d6efd22",
                        padding: "3px 8px",
                        borderRadius: 4,
                        fontWeight: 600,
                      }}>
                        REORDERED
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
