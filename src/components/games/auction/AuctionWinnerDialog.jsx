import React from 'react';
import { RotateCcw } from 'lucide-react';
import AuctionDialog from './AuctionDialog';

/** Render the existing controls with their accessible labels and responsive layout. */
export default function AuctionWinnerDialog({ isWinner, winnerLabel, winner, rankings, isScreenMode, onReset, onHome }) {
 return (isWinner ? (
          <AuctionDialog onClose={() => {}} celebrate>
            <h2 className="auction-winner-title">{winnerLabel?.startsWith('تعادل') ? winnerLabel : `مبروك الفوز للفريق: ${winnerLabel || winner?.name || '-'}`}</h2>
            <div className="auction-rankings">
              {rankings.map((team, index) => (
                <div key={`${team.name}-${index}`}>
                  <span>{index + 1}. {team.name}</span>
                  <strong>{team.score.toLocaleString()}</strong>
                </div>
              ))}
            </div>
            {!isScreenMode ? <><button type="button" className="auction-primary-button w-full" onClick={onReset}>
              <RotateCcw size={20} />
              لعب مرة أخرى
            </button>
            <button type="button" className="auction-secondary-button w-full" onClick={onHome}>
              العودة للرئيسية
            </button>
            </> : null}
          </AuctionDialog>
        ) : null);
}
