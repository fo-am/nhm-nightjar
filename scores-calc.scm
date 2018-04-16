#lang racket

  ;; binary search
(define (ordered-list-search l score)
  (define (_ start end)
    (cond
     ;; no children
     ((null? l) start)
     (else
      (let ((mid (floor (+ start (/ (- end start) 2)))))
	(cond
	 ;; not found
	 ((< (- end start) 2) start)
	 ;; found
	 ((eq? score (list-ref l mid)) mid)
	 ;; search down
	 ((> (list-ref l mid) score)
	  (_ start mid))
	 ;; search up
	 (else
	  (_ mid end)))))))
  (_ 0 (length l)))

  (ordered-list-search scores 3000)